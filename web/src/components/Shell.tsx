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
import { useT } from "@/lib/i18n";
import {
  IconHome,
  IconModels,
  IconMeasure,
  IconProfile,
  IconTailor,
  IconUsers,
  IconOrders,
} from "./icons";

export interface NavItem {
  href: string;
  label: string;
  /** Libelle anglais (la langue suit celle du telephone, lib/i18n). */
  en: string;
  /** Composant d'icone lucide, pas une chaine : le meme trait que
   *  l'application mobile, qui utilise lucide-react-native. */
  Icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
}

// Cote client : catalogue, mesures, et maintenant les tailleurs a qui les
// envoyer. Cinq entrees au plus (barre du bas au telephone) : « Mes
// commandes » est atteint depuis l'accueil et le profil.
export const CLIENT_NAV: NavItem[] = [
  { href: "/accueil", label: "Accueil", en: "Home", Icon: IconHome },
  { href: "/modeles", label: "Modèles", en: "Styles", Icon: IconModels },
  { href: "/tailleurs", label: "Tailleurs", en: "Tailors", Icon: IconTailor },
  { href: "/mesures", label: "Mes mesures", en: "Measures", Icon: IconMeasure },
  { href: "/profil", label: "Profil", en: "Profile", Icon: IconProfile },
];

/**
 * Navigation de l'espace tailleur (B3) : Accueil, Clients, Travaux, Patrons,
 * Profil. Les commandes recues via la plateforme et les recettes de
 * l'atelier sont accessibles depuis l'accueil et le profil — pas d'onglet
 * dedie (cinq entrees au plus dans la barre du bas). Ni verification, ni
 * pret-a-porter dans cette version.
 */
export const TAILOR_NAV: NavItem[] = [
  { href: "/tailleur", label: "Accueil", en: "Home", Icon: IconHome },
  { href: "/tailleur/clients", label: "Clients", en: "Clients", Icon: IconUsers },
  { href: "/tailleur/travaux", label: "Travaux", en: "Jobs", Icon: IconOrders },
  { href: "/tailleur/patrons", label: "Patrons", en: "Patterns", Icon: IconTailor },
  { href: "/tailleur/profil", label: "Profil", en: "Profile", Icon: IconProfile },
];

function NavList({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const t = useT();
  return (
    <nav className="tabbar" aria-label={t("Navigation principale", "Main navigation")}>
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
            <span>{t(item.label, item.en)}</span>
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
