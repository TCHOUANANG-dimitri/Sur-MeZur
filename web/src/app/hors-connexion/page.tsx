/**
 * Page hors connexion (B4) : servie par le service worker quand une
 * navigation echoue sans reseau. Statique, sans appel API.
 */

import Link from "next/link";

export default function HorsConnexion() {
  return (
    <main className="containerNarrow section" style={{ textAlign: "center" }}>
      <h1>Vous êtes hors ligne</h1>
      <p className="muted">
        Vérifiez votre connexion internet, puis réessayez. Vos données
        enregistrées ne sont pas perdues.
      </p>
      <Link href="/" className="btn btnPrimary">
        Réessayer
      </Link>
    </main>
  );
}
