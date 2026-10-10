/**
 * Témoignages RÉELS uniquement, avec l'accord écrit de la personne.
 *
 * La section « Ils l'utilisent » n'apparaît que si cette liste n'est pas
 * vide. Un avis inventé ferait perdre plus de confiance qu'il n'en gagne.
 *
 * `photo` (facultative) : fichier carré déposé dans `public/temoignages/`,
 * 400×400 px minimum, ex. "/temoignages/aminata.webp".
 */
export type Testimonial = {
  quote: { fr: string; en: string };
  name: string;
  /** Ex. « Tailleuse, Akwa (Douala) » / « Tailor, Akwa (Douala) ». */
  role: { fr: string; en: string };
  photo?: string;
};

export const testimonials: Testimonial[] = [];
