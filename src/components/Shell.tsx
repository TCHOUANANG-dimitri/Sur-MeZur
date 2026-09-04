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
import Image from "next/image";
import { usePathname } from "next/navigation";
import React from "react";
import {
  IconHome,
  IconModels,
  IconMeasure,
  IconProfile,
  IconDashboard,
  IconVerify,
  IconCatalog,
  IconUsers,
  IconOrders,
  IconDisputes,
  IconReviews,
  IconCommission,
} from "./icons";

export interface NavItem {
  href: string;
  label: string;
  /** Composant d'icone lucide, pas une chaine : le meme trait que
   *  l'application mobile, qui utilise lucide-react-native. */
  Icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
}

// La version web se limite volontairement au parcours de prise de mesure :
// catalogue, mesures, telechargement de la fiche. Pas de cote tailleur, pas
// de commande ni de paiement — ceux-ci restent l'affaire de l'application
// mobile.
export const CLIENT_NAV: NavItem[] = [
  { href: "/accueil", label: "Accueil", Icon: IconHome },
  { href: "/modeles", label: "Modèles", Icon: IconModels },
  { href: "/mesures", label: "Mes mesures", Icon: IconMeasure },
  { href: "/profil", label: "Profil", Icon: IconProfile },
];

export const ADMIN_NAV: NavItem[] = [
  { href: "/admin/vue-ensemble", label: "Vue d'ensemble", Icon: IconDashboard },
  { href: "/admin/verifications", label: "Vérifications", Icon: IconVerify },
  { href: "/admin/utilisateurs", label: "Utilisateurs", Icon: IconUsers },
  { href: "/admin/commandes", label: "Commandes", Icon: IconOrders },
  { href: "/admin/catalogue", label: "Catalogue", Icon: IconCatalog },
  { href: "/admin/litiges", label: "Litiges", Icon: IconDisputes },
  { href: "/admin/avis", label: "Avis", Icon: IconReviews },
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
              <item.Icon size={22} strokeWidth={active ? 2.4 : 1.9} />
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
          <Image src="/logo-mark.png" alt="" width={191} height={200} className="brandMark" />
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
