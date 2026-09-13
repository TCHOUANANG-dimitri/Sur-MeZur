// Racine du site. On y arrive depuis la landing page de presentation : la
// personne entre directement sur la prise de mesure, sans compte ni ecran
// intermediaire. /mesurer renvoie lui-meme un client deja inscrit vers le
// parcours complet.
import { redirect } from "next/navigation";

export default function Root() {
  redirect("/mesurer");
}
