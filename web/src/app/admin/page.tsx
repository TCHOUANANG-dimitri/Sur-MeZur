// Point d'entree de la section admin : on bascule immédiatement sur la vue
// d'ensemble, qui sert d'accueil aux compteurs de la plateforme.
import { redirect } from "next/navigation";

export default function AdminIndex() {
  redirect("/admin/vue-ensemble");
}
