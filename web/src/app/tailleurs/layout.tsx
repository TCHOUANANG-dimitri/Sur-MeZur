"use client";

/**
 * Annuaire des tailleurs : ouvert a tous, meme sans compte.
 *
 * Il vit HORS du groupe `(client)`, dont la mise en page exige un compte
 * client. Un client connecte retrouve sa navigation habituelle, un tailleur
 * la sienne ; un visiteur (ou un invite) a la barre publique avec l'acces a
 * la connexion. Le numero d'un tailleur, lui, n'est donne qu'aux comptes
 * connectes (`GET /tailors/{id}/contact`).
 */

import { tr } from "@/lib/i18n";
import Image from "next/image";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { CLIENT_NAV, Shell, TAILOR_NAV } from "@/components/Shell";
import { Spinner } from "@/components/ui";

export default function TailleursLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;
  const registered = user && !user.is_guest;
  if (registered && user.role === "client") return <Shell nav={CLIENT_NAV}>{children}</Shell>;
  if (registered && user.role === "tailor") return <Shell nav={TAILOR_NAV}>{children}</Shell>;
  return (
    <div className="publicShell">
      <header className="publicTopbar no-print">
        <Link href="/" className="publicBrand">
          <Image src="/logo-mark.png" alt="" width={191} height={200} priority />
          Sur-MeZur
        </Link>
        {!registered && (
          <Link href={`/connexion?suite=${encodeURIComponent("/tailleurs")}`} className="publicLogin">
            {tr("Se connecter", "Sign in")}
          </Link>
        )}
      </header>
      <main className="publicMain">{children}</main>
    </div>
  );
}
