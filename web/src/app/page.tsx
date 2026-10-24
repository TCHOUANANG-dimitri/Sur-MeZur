/**
 * Racine de l'application (app.sur-mezur.com/) : pas de vitrine ici, c'est le
 * role de la landing (sur-mezur.com). `HomeRedirect` envoie un compte connecte
 * vers son espace, un invite vers sa prise de mesure, et un visiteur vers la
 * landing.
 */

import type { Metadata } from "next";
import { HomeRedirect } from "@/components/HomeRedirect";
import { Spinner } from "@/components/ui";

export const metadata: Metadata = {
  title: "Sur-MeZur",
  robots: { index: false },
};

export default function Racine() {
  return (
    <>
      <HomeRedirect />
      <Spinner />
    </>
  );
}
