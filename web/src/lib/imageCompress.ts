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
 *  plutot que de laisser l'envoi echouer plus tard sans explication. */
export class UnreadablePhotoError extends Error {}

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

/** Copie integrale du fichier en memoire. Leve UnreadablePhotoError si le
 *  fichier ne peut pas etre lu — l'envoi aurait echoue de la meme facon. */
async function inMemoryCopy(file: File): Promise<File> {
  let buffer: ArrayBuffer;
  try {
    buffer = await file.arrayBuffer();
  } catch {
    throw new UnreadablePhotoError("Photo illisible");
  }
  if (buffer.byteLength === 0) throw new UnreadablePhotoError("Photo vide");
  return new File([buffer], file.name || "photo.jpg", {
    type: file.type || "image/jpeg",
    lastModified: Date.now(),
  });
}

export async function compressForMeasurement(file: File): Promise<File> {
  let decoded: Decoded;
  try {
    decoded = await decode(file);
  } catch {
    // Format que le navigateur ne sait pas decoder (HEIC sous Chrome, par
    // exemple) : on l'envoie tel quel, le serveur tentera sa chance — mais
    // depuis une copie en memoire, jamais depuis la reference d'origine.
    return inMemoryCopy(file);
  }

  const { source, width, height, release } = decoded;
  try {
    const ratio = Math.min(1, MAX_DIM / Math.max(width, height));
    // Deja a la bonne taille et deja legere : la reencoder ne ferait que
    // degrader l'image pour rien.
    if (ratio === 1 && file.type === "image/jpeg" && file.size < 900_000) {
      return await inMemoryCopy(file);
    }

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
    if (!blob || (ratio === 1 && blob.size >= file.size)) return await inMemoryCopy(file);

    const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg", lastModified: Date.now() });
  } finally {
    release();
  }
}
