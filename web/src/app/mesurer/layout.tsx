"use client";

import Image from "next/image";
import Link from "next/link";
import { tr } from "@/lib/i18n";

/**
 * Coquille publique du parcours sans compte.
 *
 * Pas de navigation applicative : tous ses liens menent a des pages reservees
 * aux inscrits. Juste la marque, et l'acces a la connexion pour qui a deja un
 * compte — la connexion rattache alors les mesures prises ici.
 */
export default function MesurerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="publicShell">
      <header className="publicTopbar no-print">
        <span className="publicBrand">
          <Image src="/logo-mark.png" alt="" width={191} height={200} priority />
          Sur-MeZur
        </span>
        <Link href="/connexion" className="publicLogin">
          {tr("Se connecter", "Sign in")}
        </Link>
      </header>
      <main className="publicMain">{children}</main>
    </div>
  );
}
