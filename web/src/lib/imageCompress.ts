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
 * L'ecart est considerable sur le web : une photo de galerie de telephone
 * recent fait 3 a 5 Mo, et deux partaient telles quelles sur reseau mobile,
 * a travers le proxy Vercel. Reduite, chacune tient en quelques centaines de
 * kilo-octets.
 *
 * ORIENTATION. Le reencodage par canvas efface les metadonnees EXIF, dont
 * l'orientation. On decode donc avec `imageOrientation: "from-image"`, qui
 * applique cette rotation aux pixels : sans cela, une photo prise en portrait
 * partirait couchee et la detection du squelette echouerait.
 *
 * Toute erreur renvoie le fichier d'origine : une reduction ratee ne doit
 * jamais empecher la prise de mesure.
 */

const MAX_DIM = 1600;
const JPEG_QUALITY = 0.85;

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

export async function compressForMeasurement(file: File): Promise<File> {
  try {
    const { source, width, height, release } = await decode(file);
    try {
      const ratio = Math.min(1, MAX_DIM / Math.max(width, height));
      // Deja a la bonne taille et deja legere : la reencoder ne ferait que
      // degrader l'image pour rien.
      if (ratio === 1 && file.type === "image/jpeg" && file.size < 900_000) return file;

      const targetWidth = Math.round(width * ratio);
      const targetHeight = Math.round(height * ratio);
      const canvas = document.createElement("canvas");
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return file;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(source, 0, 0, targetWidth, targetHeight);

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY)
      );
      if (!blob) return file;
      // Sans redimensionnement, on ne garde la version reencodee que si elle
      // est effectivement plus legere.
      if (ratio === 1 && blob.size >= file.size) return file;

      const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
      return new File([blob], name, { type: "image/jpeg", lastModified: Date.now() });
    } finally {
      release();
    }
  } catch {
    return file;
  }
}
