// Racine du site : on entre directement sur la page de connexion, sans page
// intermediaire. La session vivant dans `localStorage`, il n'y a rien a
// trancher cote serveur ici — chaque role protege ses propres routes.
import { redirect } from "next/navigation";

export default function Root() {
  redirect("/connexion");
}
