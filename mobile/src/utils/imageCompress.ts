import { Image } from "react-native";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";

/**
 * Plus longue arête après réduction, alignée sur `MAX_IMAGE_DIM` côté serveur
 * (backend/app/services/vision/pipeline.py) : le serveur réduit de toute
 * façon toute photo à cette taille avant de l'analyser — mesuré là-bas, 1600px
 * donne un écart de seulement 1,5cm sur les mensurations livrées par rapport à
 * la pleine résolution, pour un facteur 9,7 de temps de calcul. Envoyer plus
 * gros ne change donc rien à la précision de la mesure, seulement au temps
 * d'upload : on ne fait ici que déplacer cette même réduction avant l'envoi
 * réseau plutôt que de la payer après, à l'identique.
 */
const MAX_DIM = 1600;
const JPEG_QUALITY = 0.85;

function getSize(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    Image.getSize(uri, (width, height) => resolve({ width, height }), reject);
  });
}

/**
 * Réduit une photo de mesure avant upload (résolution + qualité JPEG).
 *
 * Ne redimensionne jamais au-delà de MAX_DIM (pas d'agrandissement) et
 * préserve les proportions en appliquant le même ratio aux deux dimensions —
 * une image étirée fausserait la détection MediaPipe/SAM bien plus qu'une
 * résolution réduite ne le fait.
 *
 * En cas d'échec (format non supporté, etc.), renvoie le fichier original :
 * une compression ratée ne doit jamais bloquer la prise de mesure.
 */
export async function compressForMeasurement(file: {
  uri: string;
  name: string;
  type: string;
}): Promise<{ uri: string; name: string; type: string }> {
  try {
    const { width, height } = await getSize(file.uri);
    const ratio = Math.min(1, MAX_DIM / Math.max(width, height));
    const targetWidth = Math.round(width * ratio);
    const targetHeight = Math.round(height * ratio);

    const rendered = await ImageManipulator.manipulate(file.uri)
      .resize({ width: targetWidth, height: targetHeight })
      .renderAsync();
    const result = await rendered.saveAsync({ compress: JPEG_QUALITY, format: SaveFormat.JPEG });

    return { uri: result.uri, name: file.name, type: "image/jpeg" };
  } catch (e) {
    console.warn("[app] compression photo échouée, envoi de l'original", e);
    return file;
  }
}
