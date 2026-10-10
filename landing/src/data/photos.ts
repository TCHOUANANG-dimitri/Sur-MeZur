import heroPattern from "../../public/photos/hero-pattern.webp";
import heroAtelier from "../../public/photos/hero-atelier.webp";
import stepFront from "../../public/photos/step-front.webp";
import stepProfile from "../../public/photos/step-profile.webp";
import stepResult from "../../public/photos/step-result.webp";
import forTailors from "../../public/photos/for-tailors.webp";
import forClients from "../../public/photos/for-clients.webp";

/**
 * Photographies importées statiquement : Next connaît leur taille (pas de
 * décalage de mise en page) et génère un aperçu flou pour les grandes.
 *
 * Les sources vivent dans `photos-src/` et sont converties par
 * `node scripts/optimize-photos.mjs`. Les images facultatives (patron,
 * captures d'écran) passent par `lib/assets.ts` : voir
 * docs/IMAGES-A-FOURNIR.md.
 */
export const photos = {
  heroPattern,
  heroAtelier,
  stepFront,
  stepProfile,
  stepResult,
  forTailors,
  forClients,
} as const;
