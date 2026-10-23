/**
 * Reduction des photos de mesure AVANT l'envoi.
 *
 * Portage de mobile/src/utils/imageCompress.ts. Le serveur ramene de toute
 * facon chaque photo a 1600 px de plus grand cote avant l'analyse
 * (MAX_IMAGE_DIM, backend/app/services/vision/pipeline.py) : mesure la-bas,
 * cette resolution ne coute que 1,5 cm d'ecart sur les mensurations pour un
 * calcul 9,7 fois plus rapide. Envoyer plus gros ne gagne donc rien en
 * precision et ne fait que ralentir l'envoi.
 *
 * ORIENTATION. Le reencodage par canvas efface les metadonnees EXIF, dont
 * l'orientation. On decode donc avec `imageOrientation: "from-image"`, qui
 * applique cette rotation aux pixels : sans cela, une photo prise en portrait
 * partirait couchee et la detection du squelette echouerait.
 *
 * TOUJOURS UNE COPIE EN MEMOIRE. Le fichier renvoye n'est JAMAIS la reference
 * au fichier d'origine, meme quand la reduction est inutile ou impossible. Un
 * `File` issu d'un selecteur n'est qu'un pointeur vers le fichier sur
 * l'appareil, relu au moment de l'envoi — et ce fichier peut ne plus etre
 * lisible entre-temps : photo de galerie synchronisee dans le nuage, fichier
 * temporaire efface. Chrome sous Android echoue alors avec
 * ERR_UPLOAD_FILE_CHANGED, Safari sous iOS avec « Load failed » ; dans les deux
 * cas `fetch` leve une erreur reseau, que rien ne distingue d'une coupure et
 * qu'aucune nouvelle tentative ne corrige. Lire le fichier des sa selection
 * fige son contenu.
 */

const MAX_DIM = 1600;
const JPEG_QUALITY = 0.85;

/** La photo choisie ne peut pas etre lue du tout : a signaler tout de suite,
 *  plutot que de laisser l'envoi echouer plus tard sans explication.
 *  `cause` : nom de l'erreur du navigateur (NotReadableError…), pour le
 *  diagnostic. */
export class UnreadablePhotoError extends Error {
  constructor(message: string, readonly empty = false, readonly cause_name = "") {
    super(message);
  }
}

/** Message a afficher quand une photo choisie n'a pas pu etre preparee. */
export function photoErrorMessage(e: unknown): string {
  if (e instanceof UnreadablePhotoError) {
    return e.empty
      ? "Ce fichier est vide. Choisissez une autre photo."
      : "Cette photo n'est pas lisible depuis le téléphone (photo restée dans le nuage ?). " +
          "Ouvrez-la d'abord dans la galerie pour la télécharger, ou prenez-la avec l'appareil photo.";
  }
  return "Cette photo n'a pas pu être préparée. Essayez-en une autre.";
}

/** Lit TOUS les octets du fichier, une seule fois. `arrayBuffer` d'abord,
 *  `FileReader` en repli (certains WebView Android ne gerent que lui). */
async function readBytes(file: File): Promise<ArrayBuffer> {
  try {
    return await file.arrayBuffer();
  } catch (first) {
    try {
      return await new Promise<ArrayBuffer>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(file);
      });
    } catch {
      const name = first instanceof Error ? first.name : "";
      console.warn("Photo illisible :", name || first);
      throw new UnreadablePhotoError("Photo illisible", false, name);
    }
  }
}

interface Decoded {
  source: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
}

async function decode(file: File): Promise<Decoded> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
    } catch {
      /* navigateur trop ancien ou format non gere : repli sur <img> */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return {
      source: img,
      width: img.naturalWidth,
      height: img.naturalHeight,
      release: () => URL.revokeObjectURL(url),
    };
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
}

/**
 * Photo prete a l'envoi : reduite a 1600 px si besoin, en JPEG.
 *
 * Le fichier n'est lu QU'UNE FOIS, au tout debut : decodage et reduction
 * partent de cette copie en memoire. Lire le `File` d'origine deux fois
 * (decodage, puis copie) echouait souvent sous Android a la seconde lecture
 * — photo de la galerie restee dans le nuage, image recue par WhatsApp,
 * fichier d'un fournisseur `content://` — et une photo sans defaut etait
 * declaree « illisible ».
 */
export async function compressForMeasurement(file: File): Promise<File> {
  const bytes = await readBytes(file);
  if (bytes.byteLength === 0) throw new UnreadablePhotoError("Photo vide", true);
  const copy = new File([bytes], file.name || "photo.jpg", {
    type: file.type || "image/jpeg",
    lastModified: Date.now(),
  });

  let decoded: Decoded;
  try {
    decoded = await decode(copy);
  } catch {
    // Format que le navigateur ne sait pas decoder (HEIC sous Chrome, par
    // exemple) : on envoie la copie telle quelle, le serveur dira si le
    // format est accepte.
    return copy;
  }

  const { source, width, height, release } = decoded;
  try {
    const ratio = Math.min(1, MAX_DIM / Math.max(width, height));
    // Deja a la bonne taille et deja legere : la reencoder ne ferait que
    // degrader l'image pour rien.
    if (ratio === 1 && copy.type === "image/jpeg" && copy.size < 900_000) return copy;

    const targetWidth = Math.round(width * ratio);
    const targetHeight = Math.round(height * ratio);
    let blob: Blob | null = null;
    try {
      const canvas = document.createElement("canvas");
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(source, 0, 0, targetWidth, targetHeight);
        blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY)
        );
      }
    } catch {
      blob = null; // canvas trop grand pour la memoire de l'appareil, etc.
    }

    // Sans redimensionnement, on ne garde la version reencodee que si elle
    // est effectivement plus legere.
    if (!blob || (ratio === 1 && blob.size >= copy.size)) return copy;

    const name = copy.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg", lastModified: Date.now() });
  } finally {
    release();
  }
}
