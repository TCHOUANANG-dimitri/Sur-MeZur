"use client";

/**
 * Page hors connexion (B4) : servie par le service worker quand une
 * navigation echoue sans reseau. Sans appel API ; texte dans la langue du
 * telephone.
 */

import Link from "next/link";
import { tr } from "@/lib/i18n";

export default function HorsConnexion() {
  return (
    <main className="containerNarrow section" style={{ textAlign: "center" }}>
      <h1>{tr("Vous êtes hors ligne", "You're offline")}</h1>
      <p className="muted">{tr("Vérifiez votre connexion, puis réessayez.", "Check your connection, then try again.")}</p>
      <Link href="/" className="btn btnPrimary">
        {tr("Réessayer", "Try again")}
      </Link>
    </main>
  );
}
