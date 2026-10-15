/**
 * Reduction des photos AVANT stockage et envoi.
 *
 * Adaptation de web/src/lib/imageCompress.ts. Difference voulue : 2048 px et
 * JPEG 0,90 au lieu de 1600 px / 0,85. La production ramene chaque photo a
 * 1600 px avant l'analyse, mais ce jeu de donnees servira aussi a des modeles
 * FUTURS : on garde un peu de marge de resolution, sans envoyer les 3 a 5 Mo
 * d'un original de telephone sur un reseau mobile (~0,5 Mo par photo ici).
 *
 * ORIENTATION. Le reencodage par canvas efface les metadonnees EXIF, dont
 * l'orientation : on decode avec `imageOrientation: "from-image"`, qui
 * l'applique aux pixels. Sans cela une photo portrait partirait couchee.
 *
 * TOUJOURS UNE COPIE EN MEMOIRE. Un `File` issu d'un selecteur n'est qu'un
 * pointeur vers le fichier de l'appareil, relu au moment de l'envoi — et il
 * peut ne plus etre lisible entre-temps (photo de galerie synchronisee dans
 * le nuage). Ici c'est d'autant plus important que la photo attend dans la
 * file hors ligne, parfois des heures, avant de partir.
 */

const MAX_DIM = 2048;
const JPEG_QUALITY = 0.9;

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

export async function preparePhoto(file: File): Promise<File> {
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
    if (ratio === 1 && file.type === "image/jpeg" && file.size < 1_200_000) {
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
