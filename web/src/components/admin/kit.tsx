"use client";

/**
 * Petits composants des ecrans d'administration : en-tete de page,
 * panneaux, indicateurs, onglets, badges de statut, etats, image protegee,
 * notes internes (0.10), texte formate.
 */

import Link from "next/link";
import React, { useCallback, useEffect, useState } from "react";
import { Core, type Note } from "@/lib/api/admin";
import { ApiError, getToken } from "@/lib/api/client";
import { Badge, Button } from "@/components/ui";
import { IconBack, IconRetry, IconTrash } from "@/components/icons";
import { useFeedback } from "./Feedback";
import { formatDateTime, formatNumber, formatPct } from "./format";
import { useAdmin } from "./AdminContext";

export function PageHead({
  title,
  sub,
  back,
  actions,
}: {
  title: string;
  sub?: React.ReactNode;
  back?: { href: string; label: string };
  actions?: React.ReactNode;
}) {
  return (
    <div>
      {back && (
        <Link href={back.href} className="adBack adNoPrint">
          <IconBack size={16} /> {back.label}
        </Link>
      )}
      <div className="adPageHead">
        <h1>
          {title}
          {sub && <div className="adPageSub">{sub}</div>}
        </h1>
        {actions && <div className="adRow adNoPrint">{actions}</div>}
      </div>
    </div>
  );
}

export function Panel({
  title,
  actions,
  children,
  className = "",
  id,
}: {
  title?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section className={`adPanel ${className}`} id={id}>
      {(title || actions) && (
        <h2 className="adPanelTitle">
          {title}
          <span className="adSpacer" />
          {actions}
        </h2>
      )}
      {children}
    </section>
  );
}

export function Kpi({
  label,
  value,
  change,
  hint,
  href,
  invert,
}: {
  label: string;
  value: React.ReactNode;
  change?: number | null;
  hint?: React.ReactNode;
  href?: string;
  /** Une hausse est mauvaise (echecs, litiges, churn). */
  invert?: boolean;
}) {
  const good = change == null ? null : invert ? change < 0 : change > 0;
  const body = (
    <>
      <div className="adKpiLabel">{label}</div>
      <div className="adKpiValue">{value}</div>
      {change != null && (
        <div className={`adKpiDelta ${change === 0 ? "adMuted" : good ? "adUp" : "adDown"}`}>
          {change > 0 ? "+" : ""}
          {formatNumber(change, 1)} % vs période précédente
        </div>
      )}
      {hint && <div className="adHint">{hint}</div>}
    </>
  );
  return href ? (
    <Link href={href} className="adKpi">
      {body}
    </Link>
  ) : (
    <div className="adKpi">{body}</div>
  );
}

export function Progress({ pct }: { pct: number | null | undefined }) {
  const v = Math.max(0, Math.min(100, pct ?? 0));
  return (
    <div className="adProgress" role="progressbar" aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100}>
      <span style={{ width: `${v}%` }} />
    </div>
  );
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { key: T; label: string; count?: number }[];
  value: T;
  onChange: (key: T) => void;
}) {
  return (
    <div className="adTabs" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.key}
          role="tab"
          aria-selected={value === t.key}
          className={`adTab ${value === t.key ? "adTabActive" : ""}`}
          onClick={() => onChange(t.key)}
        >
          {t.label}
          {t.count ? <span className="adCount">{t.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function StatusBadge({
  map,
  value,
}: {
  map: Record<string, { label: string; tone: "success" | "error" | "neutral" | "pending" }>;
  value: string | null | undefined;
}) {
  if (!value) return <span className="adMuted">—</span>;
  const m = map[value];
  return <Badge tone={m?.tone ?? "neutral"}>{m?.label ?? value}</Badge>;
}

export function Loading({ label = "Chargement…" }: { label?: string }) {
  return (
    <div className="adState" role="status">
      <div className="spinner" />
      <p>{label}</p>
    </div>
  );
}

/** 0.9 — erreur explicite avec une action proposee. */
export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const status = error instanceof ApiError ? error.status : 0;
  return (
    <div className="adState" role="alert">
      <h3>{status === 403 ? "Accès non autorisé" : status === 404 ? "Introuvable" : status === 0 ? "Connexion impossible" : "Erreur"}</h3>
      <p>
        {status === 403
          ? "Votre rôle d'administration ne donne pas accès à cette page."
          : status === 0
            ? "Vérifiez votre connexion internet puis réessayez."
            : (error as Error)?.message}
      </p>
      {onRetry && status !== 403 && status !== 404 && (
        <Button variant="secondary" onClick={onRetry}>
          <IconRetry size={16} /> Réessayer
        </Button>
      )}
    </div>
  );
}

/** Chargement d'une ressource avec etats et rechargement. */
export function useLoad<T>(loader: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    loader()
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(e))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading, reload, setData };
}

/** Image servie par une route protegee (photos de la campagne de collecte) :
 *  une balise <img> n'envoie pas le jeton, on la telecharge donc avec. */
export function AuthImage({ src, alt, className, style }: { src: string; alt: string; className?: string; style?: React.CSSProperties }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let revoke: string | null = null;
    let alive = true;
    setFailed(false);
    fetch(src, { headers: { Authorization: `Bearer ${getToken() ?? ""}`, "X-SMZ-Platform": "web" } })
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))))
      .then((b) => {
        if (!alive) return;
        revoke = URL.createObjectURL(b);
        setUrl(revoke);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
      if (revoke) URL.revokeObjectURL(revoke);
    };
  }, [src]);
  if (failed) return <div className={className} style={{ ...style, display: "grid", placeItems: "center" }}>Photo indisponible</div>;
  if (!url) return <div className={`adSkeleton ${className ?? ""}`} style={{ ...style, height: style?.height ?? 120 }} />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={alt} className={className} style={style} />;
}

/** 0.10 — notes internes d'une fiche, visibles seulement par l'equipe. */
export function Notes({ entityType, entityId }: { entityType: string; entityId: string }) {
  const { me } = useAdmin();
  const { toast, confirm } = useFeedback();
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    Core.notes(entityType, entityId)
      .then(setNotes)
      .catch(() => setNotes([]));
  }, [entityType, entityId]);
  useEffect(load, [load]);
  const add = async () => {
    if (!body.trim()) return;
    setBusy(true);
    try {
      const note = await Core.addNote(entityType, entityId, body.trim());
      setNotes((n) => [note, ...(n ?? [])]);
      setBody("");
    } catch (e) {
      toast((e as Error).message, { error: true });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Panel title="Notes internes">
      <p className="adHint" style={{ marginTop: -6 }}>Visibles seulement par l&apos;équipe. Datées et signées.</p>
      <textarea
        className="input adTextarea"
        placeholder="Contexte, appel passé, décision à suivre…"
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      <div className="adRow" style={{ justifyContent: "flex-end", margin: "8px 0 12px" }}>
        <Button className="adBtnSm" onClick={add} disabled={busy || !body.trim()}>
          Ajouter la note
        </Button>
      </div>
      {notes === null ? (
        <div className="adSkeleton" />
      ) : notes.length === 0 ? (
        <p className="adHint">Aucune note.</p>
      ) : (
        notes.map((n) => (
          <div key={n.id} className="adNote">
            <div className="adMeta adRow">
              <span>
                {n.author_name} · {formatDateTime(n.created_at)}
              </span>
              <span className="adSpacer" />
              {n.author_id === me?.id && (
                <button
                  className="btn btnGhost adBtnSm adNoPrint"
                  aria-label="Supprimer la note"
                  onClick={async () => {
                    if ((await confirm({ title: "Supprimer cette note ?", danger: true, confirmLabel: "Supprimer" })) === null) return;
                    await Core.deleteNote(n.id).catch(() => {});
                    load();
                  }}
                >
                  <IconTrash size={14} />
                </button>
              )}
            </div>
            {n.body}
          </div>
        ))
      )}
    </Panel>
  );
}

/** Texte formate minimal (titres ##, listes -, **gras**, liens) pour les
 *  pages d'information. Le texte est echappe avant mise en forme : aucune
 *  balise saisie ne passe telle quelle. */
export function renderMarkdown(src: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const inline = (s: string) =>
    esc(s)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+|\/[^)\s]*)\)/g, '<a href="$2" rel="noopener">$1</a>');
  const out: string[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) out.push(`<ul>${list.map((l) => `<li>${l}</li>`).join("")}</ul>`);
    list = [];
  };
  for (const block of src.replace(/\r/g, "").split("\n")) {
    const line = block.trim();
    if (!line) {
      flush();
      continue;
    }
    if (line.startsWith("- ") || line.startsWith("* ")) {
      list.push(inline(line.slice(2)));
      continue;
    }
    flush();
    if (line.startsWith("### ")) out.push(`<h3>${inline(line.slice(4))}</h3>`);
    else if (line.startsWith("## ")) out.push(`<h2>${inline(line.slice(3))}</h2>`);
    else if (line.startsWith("# ")) out.push(`<h2>${inline(line.slice(2))}</h2>`);
    else out.push(`<p>${inline(line)}</p>`);
  }
  flush();
  return out.join("");
}

export function Pct({ v }: { v: number | null | undefined }) {
  return <>{formatPct(v)}</>;
}
