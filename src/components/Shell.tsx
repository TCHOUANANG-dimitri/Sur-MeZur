"use client";

/**
 * Coquille de navigation, commune aux trois roles.
 *
 * Un seul balisage sert les deux presentations : au telephone la liste de
 * liens est fixee en bas de l'ecran, a partir de 1024px la meme liste devient
 * une colonne laterale (voir `src/styles/shell.css`). Aucun rendu conditionnel
 * sur la largeur — donc rien qui puisse diverger entre « la version mobile »
 * et « la version bureau », et aucun saut visuel a l'hydratation.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import React from "react";

export interface NavItem {
  href: string;
  label: string;
  icon: string;
}

// La version web se limite volontairement au parcours de prise de mesure :
// catalogue, mesures, telechargement de la fiche. Pas de cote tailleur, pas
// de commande ni de paiement — ceux-ci restent l'affaire de l'application
// mobile.
export const CLIENT_NAV: NavItem[] = [
  { href: "/accueil", label: "Accueil", icon: "🏠" },
  { href: "/modeles", label: "Modèles", icon: "👗" },
  { href: "/mesures", label: "Mes mesures", icon: "📐" },
  { href: "/profil", label: "Profil", icon: "👤" },
];

export const ADMIN_NAV: NavItem[] = [
  { href: "/admin/vue-ensemble", label: "Vue d'ensemble", icon: "🏠" },
  { href: "/admin/verifications", label: "Vérifications", icon: "✅" },
  { href: "/admin/utilisateurs", label: "Utilisateurs", icon: "👥" },
  { href: "/admin/commandes", label: "Commandes", icon: "📦" },
  { href: "/admin/catalogue", label: "Catalogue", icon: "📁" },
  { href: "/admin/litiges", label: "Litiges", icon: "⚖️" },
  { href: "/admin/avis", label: "Avis", icon: "⭐" },
];

function NavList({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav className="tabbar" aria-label="Navigation principale">
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`tabItem ${active ? "tabItemActive" : ""}`}
            aria-current={active ? "page" : undefined}
          >
            <span className="tabIcon" aria-hidden>
              {item.icon}
            </span>
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function Shell({ nav, children }: { nav: NavItem[]; children: React.ReactNode }) {
  return (
    <div className="shell">
      {/* Colonne laterale : masquee sous 1024px par la feuille de style. */}
      <aside className="sidenav no-print">
        <div className="brand">
          <span className="brandMark" aria-hidden>
            S
          </span>
          Sur-MeZur
        </div>
        <NavList items={nav} />
      </aside>

      <main className="shellMain">{children}</main>

      {/* Barre du bas : masquee au-dessus de 1024px, ou la colonne prend le
          relais. Le `no-print` evite de l'imprimer sur la fiche de mesures. */}
      <div className="no-print" data-mobile-nav>
        <NavList items={nav} />
      </div>
    </div>
  );
}
