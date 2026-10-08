"use client";

/**
 * Coquille de l'administration web (0.1, 0.2, 0.3, 0.12).
 *
 * Ordinateur : menu lateral groupe, avec le nombre d'elements en attente a
 * cote de chaque entree. Telephone : barre du bas avec les quatre entrees
 * les plus utiles et un bouton « Menu » qui ouvre le reste dans un tiroir.
 * Les memes pages servent tous les ecrans.
 */

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Core, type SearchResult } from "@/lib/api/admin";
import { useAdmin } from "./AdminContext";
import {
  IconAcquisition,
  IconCatalog,
  IconCollecte,
  IconComms,
  IconDashboard,
  IconDisputes,
  IconJournal,
  IconLight,
  IconLogout,
  IconMeasure,
  IconMenu,
  IconMoon,
  IconOrders,
  IconPayments,
  IconQueue,
  IconReviews,
  IconSearch,
  IconServer,
  IconSettings,
  IconShield,
  IconStats,
  IconSupport,
  IconTailor,
  IconTeam,
  IconUsers,
  IconVerify,
} from "@/components/icons";

type IconType = React.ComponentType<{ size?: number; strokeWidth?: number }>;

interface Item {
  href: string;
  label: string;
  Icon: IconType;
  /** Permission requise (au moins une). */
  perm: string[];
  /** Cle du compteur renvoye par /admin/counters. */
  counter?: string;
}

const GROUPS: { title: string; items: Item[] }[] = [
  {
    title: "Pilotage",
    items: [
      { href: "/admin/vue-ensemble", label: "Tableau de bord", Icon: IconDashboard, perm: ["dashboard"] },
      { href: "/admin/a-traiter", label: "À traiter", Icon: IconQueue, perm: ["dashboard"] },
      { href: "/admin/statistiques", label: "Utilisateurs & croissance", Icon: IconStats, perm: ["growth"] },
      { href: "/admin/acquisition", label: "Acquisition", Icon: IconAcquisition, perm: ["growth"], counter: "acquisition" },
    ],
  },
  {
    title: "Comptes",
    items: [
      { href: "/admin/utilisateurs", label: "Utilisateurs", Icon: IconUsers, perm: ["users.read"] },
      { href: "/admin/verifications", label: "Vérifications", Icon: IconVerify, perm: ["tailors"], counter: "verifications" },
      { href: "/admin/tailleurs", label: "Tailleurs", Icon: IconTailor, perm: ["tailors"] },
    ],
  },
  {
    title: "Activité",
    items: [
      { href: "/admin/commandes", label: "Commandes", Icon: IconOrders, perm: ["orders.read"], counter: "orders" },
      { href: "/admin/litiges", label: "Litiges", Icon: IconDisputes, perm: ["disputes"], counter: "disputes" },
      { href: "/admin/paiements", label: "Paiements", Icon: IconPayments, perm: ["payments"], counter: "payments" },
      { href: "/admin/avis", label: "Avis", Icon: IconReviews, perm: ["reviews"], counter: "reviews" },
    ],
  },
  {
    title: "Produit",
    items: [
      { href: "/admin/catalogue", label: "Catalogue", Icon: IconCatalog, perm: ["catalog"], counter: "catalog" },
      { href: "/admin/mesure", label: "Mesure par photo", Icon: IconMeasure, perm: ["measure"] },
      { href: "/admin/collecte", label: "Campagne de collecte", Icon: IconCollecte, perm: ["collecte"], counter: "collecte" },
    ],
  },
  {
    title: "Relation",
    items: [
      { href: "/admin/communication", label: "Communication", Icon: IconComms, perm: ["comms"] },
      { href: "/admin/support", label: "Support", Icon: IconSupport, perm: ["support"], counter: "support" },
    ],
  },
  {
    title: "Administration",
    items: [
      { href: "/admin/equipe", label: "Équipe et rôles", Icon: IconTeam, perm: ["security"] },
      { href: "/admin/journal", label: "Journal des actions", Icon: IconJournal, perm: ["security"] },
      { href: "/admin/reglages", label: "Réglages", Icon: IconSettings, perm: ["security"] },
      { href: "/admin/etat", label: "État technique", Icon: IconServer, perm: ["security"] },
      { href: "/admin/securite", label: "Mon compte", Icon: IconShield, perm: [] },
    ],
  },
];

const BOTTOM = ["/admin/vue-ensemble", "/admin/a-traiter", "/admin/utilisateurs", "/admin/commandes"];

function useTheme(): [string, () => void] {
  const [theme, setTheme] = useState("light");
  useEffect(() => {
    let saved = "light";
    try {
      saved = localStorage.getItem("smz_admin_theme") ?? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    } catch {
      /* stockage indisponible : theme clair */
    }
    setTheme(saved);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    return () => {
      // En quittant l'administration, le site client reste en theme clair.
      delete document.documentElement.dataset.theme;
    };
  }, [theme]);
  const toggle = () =>
    setTheme((t) => {
      const next = t === "dark" ? "light" : "dark";
      try {
        localStorage.setItem("smz_admin_theme", next);
      } catch {
        /* ignore */
      }
      return next;
    });
  return [theme, toggle];
}

function NavItems({ items, counters, onNavigate }: { items: Item[]; counters: Record<string, number>; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <>
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const count = item.counter ? counters[item.counter] : 0;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={`adNavItem ${active ? "adNavItemActive" : ""}`}
            aria-current={active ? "page" : undefined}
          >
            <item.Icon size={18} strokeWidth={active ? 2.3 : 1.9} />
            <span className="adNavLabel">{item.label}</span>
            {count ? (
              <span className="adCount" aria-label={`${count} en attente`}>
                {count > 99 ? "99+" : count}
              </span>
            ) : null}
          </Link>
        );
      })}
    </>
  );
}

function Navigation({ onNavigate }: { onNavigate?: () => void }) {
  const { me, counters, can, logout } = useAdmin();
  return (
    <>
      <div className="adBrand">
        <Image src="/logo-mark.png" alt="" width={191} height={200} />
        <div>
          Sur-MeZur
          <div className="adBrandSub">Administration</div>
        </div>
      </div>
      {GROUPS.map((g) => {
        const items = g.items.filter((i) => i.perm.length === 0 || i.perm.some((p) => can(p)));
        if (!items.length) return null;
        return (
          <nav key={g.title} className="adNavGroup" aria-label={g.title}>
            <div className="adNavGroupTitle">{g.title}</div>
            <NavItems items={items} counters={counters} onNavigate={onNavigate} />
          </nav>
        );
      })}
      {me && (
        <div className="adUserBox">
          <strong>{me.full_name}</strong>
          <div className="adHint">{me.admin_role_label}</div>
          <button className="btn btnGhost adBtnSm" style={{ marginTop: 8, paddingLeft: 0 }} onClick={logout}>
            <IconLogout size={16} /> Se déconnecter
          </button>
        </div>
      )}
    </>
  );
}

const TYPE_LABEL: Record<string, string> = {
  user: "Utilisateur",
  order: "Commande",
  dispute: "Litige",
  model: "Modèle",
  tailor: "Tailleur",
  ticket: "Support",
};

/** 0.3 — recherche globale, ouverte par Ctrl+K (ou Cmd+K). */
function GlobalSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    if (!open) {
      setQ("");
      setResults([]);
    }
  }, [open]);

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    const id = ++seq.current;
    setLoading(true);
    const t = setTimeout(() => {
      Core.search(q.trim())
        .then((r) => id === seq.current && (setResults(r.results), setActive(0)))
        .catch(() => id === seq.current && setResults([]))
        .finally(() => id === seq.current && setLoading(false));
    }, 220);
    return () => clearTimeout(t);
  }, [q]);

  if (!open) return null;
  const go = (r: SearchResult) => {
    onClose();
    router.push(r.href);
  };
  return (
    <div className="adModalBackdrop" role="presentation" onClick={onClose}>
      <div className="adModal adSearchModal" role="dialog" aria-modal="true" aria-label="Recherche" onClick={(e) => e.stopPropagation()}>
        <input
          className="adSearchInput"
          autoFocus
          placeholder="Nom, téléphone, n° de commande, modèle, demande…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
            if (e.key === "ArrowDown") setActive((a) => Math.min(a + 1, results.length - 1));
            if (e.key === "ArrowUp") setActive((a) => Math.max(a - 1, 0));
            if (e.key === "Enter" && results[active]) go(results[active]);
          }}
          aria-label="Rechercher dans l'administration"
        />
        <div className="adSearchResults" role="listbox">
          {q.trim().length < 2 && <div className="adState">Tapez au moins deux caractères.</div>}
          {q.trim().length >= 2 && !loading && results.length === 0 && <div className="adState">Aucun résultat.</div>}
          {results.map((r, i) => (
            <Link
              key={`${r.href}-${i}`}
              href={r.href}
              onClick={onClose}
              role="option"
              aria-selected={i === active}
              className={`adSearchItem ${i === active ? "adSearchItemActive" : ""}`}
            >
              <span className="badge badgeNeutral">{TYPE_LABEL[r.type] ?? r.type}</span>
              <span style={{ minWidth: 0 }}>
                <strong>{r.title}</strong>
                <div className="adHint">{r.subtitle}</div>
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { counters, can } = useAdmin();
  const [drawer, setDrawer] = useState(false);
  const [search, setSearch] = useState(false);
  const [theme, toggleTheme] = useTheme();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearch(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => setDrawer(false), [pathname]);

  const all = GROUPS.flatMap((g) => g.items);
  const current = all.find((i) => pathname === i.href || pathname.startsWith(`${i.href}/`));
  const bottom = all.filter((i) => BOTTOM.includes(i.href) && i.perm.some((p) => can(p)));
  const closeSearch = useCallback(() => setSearch(false), []);
  const totalPending = Object.values(counters).reduce((a, b) => a + b, 0);

  return (
    <div className="adShell">
      <aside className="adSide">
        <Navigation />
      </aside>

      <div className="adMain">
        <header className="adTop">
          <button className="adIconBtn adMenuBtn" onClick={() => setDrawer(true)} aria-label="Ouvrir le menu">
            <IconMenu size={20} />
          </button>
          <div className="adTopTitle">{current?.label ?? "Administration"}</div>
          <button className="adSearchBtn" onClick={() => setSearch(true)} aria-label="Rechercher (Ctrl+K)">
            <IconSearch size={16} />
            <span className="adSearchLabel">Rechercher…</span>
            <kbd>Ctrl K</kbd>
          </button>
          <button
            className="adIconBtn"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Passer au thème clair" : "Passer au thème sombre"}
            title={theme === "dark" ? "Thème clair" : "Thème sombre"}
          >
            {theme === "dark" ? <IconLight size={18} /> : <IconMoon size={18} />}
          </button>
        </header>

        {children}
      </div>

      <nav className="adBottom" aria-label="Navigation rapide">
        {bottom.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const count = item.counter ? counters[item.counter] : 0;
          return (
            <Link key={item.href} href={item.href} className={`adBottomItem ${active ? "adBottomItemActive" : ""}`}>
              <item.Icon size={21} strokeWidth={active ? 2.4 : 1.9} />
              <span>{item.label.split(" ")[0]}</span>
              {count ? <span className="adCount">{count}</span> : null}
            </Link>
          );
        })}
        <button className="adBottomItem" onClick={() => setDrawer(true)} aria-label="Toutes les rubriques">
          <IconMenu size={21} />
          <span>Menu</span>
          {totalPending ? <span className="adCount">{totalPending > 99 ? "99+" : totalPending}</span> : null}
        </button>
      </nav>

      {drawer && (
        <>
          <div className="adDrawerBackdrop" onClick={() => setDrawer(false)} />
          <aside className="adDrawer" aria-label="Menu">
            <Navigation onNavigate={() => setDrawer(false)} />
          </aside>
        </>
      )}

      <GlobalSearch open={search} onClose={closeSearch} />
    </div>
  );
}
