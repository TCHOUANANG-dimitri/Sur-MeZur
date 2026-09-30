"use client";

/**
 * Coquille de navigation : meme balisage et memes classes que la version web
 * (web/src/components/Shell.tsx) — barre d'onglets en bas au telephone,
 * colonne laterale a partir de 1024 px.
 *
 * Garde de role incluse : seuls les agents et les administrateurs entrent.
 */

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import React, { useEffect } from "react";
import { ALLOWED_ROLES, useAuth } from "./AuthProvider";
import { OutboxProvider, useOutbox } from "./OutboxProvider";
import { Spinner } from "./ui";
import {
  IconDashboard,
  IconExport,
  IconLogout,
  IconNewSubject,
  IconOffline,
  IconProtocol,
  IconSubjects,
  IconTeam,
  IconUpload,
} from "./icons";

interface NavItem {
  href: string;
  label: string;
  /** Libelle de la barre d'onglets du telephone, ou six onglets ne laissent
   *  que ~65 px chacun. */
  short?: string;
  Icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  adminOnly?: boolean;
}

const NAV: NavItem[] = [
  { href: "/tableau-de-bord", label: "Accueil", Icon: IconDashboard },
  { href: "/sujets/nouveau", label: "Nouvelle fiche", short: "Saisir", Icon: IconNewSubject },
  { href: "/sujets", label: "Fiches", Icon: IconSubjects },
  { href: "/protocole", label: "Protocole", Icon: IconProtocol },
  { href: "/export", label: "Export", Icon: IconExport, adminOnly: true },
  { href: "/equipe", label: "Équipe", Icon: IconTeam, adminOnly: true },
];

function NavList({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  // Le lien le plus specifique gagne : « /sujets/nouveau » ne doit pas
  // allumer aussi « /sujets ».
  const activeHref = items
    .map((i) => i.href)
    .filter((h) => pathname === h || pathname.startsWith(`${h}/`))
    .sort((a, b) => b.length - a.length)[0];
  return (
    <nav className="tabbar" aria-label="Navigation principale">
      {items.map((item) => {
        const active = item.href === activeHref;
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
            <span>
              <span className="labelLong">{item.label}</span>
              <span className="labelShort">{item.short ?? item.label}</span>
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

/** Pastille d'etat de la file, dans la colonne laterale et en haut du tableau de bord. */
export function SyncBadge() {
  const { items, syncing, offline } = useOutbox();
  if (items.length === 0) return null;
  return (
    <span className={`syncBadge ${offline ? "syncBadgeOffline" : ""}`} role="status">
      {offline ? <IconOffline size={14} aria-hidden /> : <IconUpload size={14} aria-hidden />}
      {syncing ? "Envoi…" : `${items.length} en attente`}
    </span>
  );
}

function Guarded({ children }: { children: React.ReactNode }) {
  const { user, loading, isAdmin, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace("/connexion");
  }, [loading, user, router]);

  if (loading) return <Spinner label="Chargement…" />;
  if (!user) return null;
  if (!ALLOWED_ROLES.includes(user.role)) {
    return (
      <main className="authScreen">
        <div className="authForm center">
          <h1 className="authTitle">Accès réservé</h1>
          <p className="muted">
            Cette application est réservée aux agents de collecte Sur-MeZur. Demandez un accès à un administrateur.
          </p>
          <button className="btn btnSecondary" onClick={logout}>
            Se déconnecter
          </button>
        </div>
      </main>
    );
  }

  const items = NAV.filter((i) => !i.adminOnly || isAdmin);
  // Le fournisseur englobe TOUTE la coquille : la pastille de la colonne
  // laterale lit la meme file que les pages.
  return (
    <OutboxProvider>
    <div className="shell">
      <aside className="sidenav">
        <div className="brand">
          <Image src="/logo-mark.png" alt="" width={191} height={200} className="brandMark" priority />
          <span>
            Sur-MeZur
            <small className="brandSub">Collecte</small>
          </span>
        </div>
        <NavList items={items} />
        <div className="sideFooter">
          <SyncBadge />
          <p className="sideUser">{user.full_name}</p>
          <button className="btn btnGhost btnSmall" onClick={logout}>
            <IconLogout size={16} aria-hidden /> Déconnexion
          </button>
        </div>
      </aside>

      <main className="shellMain">{children}</main>

      <div data-mobile-nav>
        <NavList items={items} />
      </div>
    </div>
    </OutboxProvider>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  return <Guarded>{children}</Guarded>;
}
