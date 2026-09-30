import { redirect } from "next/navigation";

// La coquille (app/(app)/layout.tsx) renvoie vers la connexion s'il n'y a pas
// de session.
export default function Root() {
  redirect("/tableau-de-bord");
}
