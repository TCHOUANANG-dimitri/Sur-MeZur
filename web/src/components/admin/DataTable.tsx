"use client";

/**
 * Tableau des listes de l'administration (0.4 a 0.7, 0.9, exigence Q3).
 *
 *  - pagination, tri et filtres faits par le serveur ;
 *  - filtres, tri et page conserves dans l'adresse (0.5) : une vue filtree
 *    se met en favori ou s'envoie a un collegue ;
 *  - choix des colonnes affichees, memorise par navigateur ;
 *  - export CSV des lignes filtrees (toutes les pages) ;
 *  - selection de lignes et actions groupees ;
 *  - etats chargement / vide / erreur / droits explicites.
 */

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError } from "@/lib/api/client";
import { exportTable, type Page, type Params } from "@/lib/api/admin";
import { Button } from "@/components/ui";
import { IconColumns, IconDownload, IconRetry, IconSort, IconSortDown, IconSortUp } from "@/components/icons";
import { useFeedback } from "./Feedback";

// --- Etat dans l'adresse ------------------------------------------------------

export function useUrlState<T extends Record<string, string>>(defaults: T): [T, (patch: Partial<T>, keepPage?: boolean) => void] {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const key = JSON.stringify(defaults);
  const state = useMemo(() => {
    const base = JSON.parse(key) as T;
    const out: Record<string, string> = { ...base };
    sp.forEach((v, k) => {
      out[k] = v;
    });
    return out as T;
  }, [sp, key]);
  const set = useCallback(
    (patch: Partial<T>, keepPage = false) => {
      const base = JSON.parse(key) as T;
      const next = new URLSearchParams(sp.toString());
      Object.entries(patch).forEach(([k, v]) => {
        if (v === undefined || v === null || v === "" || v === base[k]) next.delete(k);
        else next.set(k, String(v));
      });
      if (!keepPage && !("page" in patch)) next.delete("page");
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [sp, router, pathname, key]
  );
  return [state, set];
}

// --- Colonnes -----------------------------------------------------------------

export interface Column<T> {
  key: string;
  label: string;
  /** Cle de tri cote serveur ; absente = colonne non triable. */
  sort?: string;
  render?: (row: T) => React.ReactNode;
  align?: "right";
  /** Masquee par defaut (affichable via « Colonnes »). */
  optional?: boolean;
}

function readCols(id: string): string[] | null {
  try {
    const raw = localStorage.getItem(`smz_cols_${id}`);
    return raw ? (JSON.parse(raw) as string[]) : null;
  } catch {
    return null;
  }
}

// --- Composant ---------------------------------------------------------------------

export interface DataTableProps<T> {
  id: string;
  columns: Column<T>[];
  fetcher: (params: Params) => Promise<Page<T>>;
  /** Filtres courants (sans page/tri), transmis tels quels au serveur. */
  filters: Params;
  query: { page: string; page_size: string; sort: string; dir: string };
  onQuery: (patch: Partial<{ page: string; page_size: string; sort: string; dir: string }>, keepPage?: boolean) => void;
  rowKey: (row: T) => string;
  rowHref?: (row: T) => string | undefined;
  /** Export : chemin de l'API et nom du fichier. */
  exportPath?: string;
  exportName?: string;
  selectable?: boolean;
  bulk?: (ids: string[], done: () => void) => React.ReactNode;
  empty?: { title: string; body?: string };
  reloadToken?: number;
  onLoaded?: (page: Page<T>) => void;
}

export function DataTable<T>({
  id,
  columns,
  fetcher,
  filters,
  query,
  onQuery,
  rowKey,
  rowHref,
  exportPath,
  exportName,
  selectable,
  bulk,
  empty,
  reloadToken = 0,
  onLoaded,
}: DataTableProps<T>) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [data, setData] = useState<Page<T> | null>(null);
  const [error, setError] = useState<{ status: number; message: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [visible, setVisible] = useState<string[]>(() => columns.filter((c) => !c.optional).map((c) => c.key));
  const [menu, setMenu] = useState(false);
  const [retry, setRetry] = useState(0);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const saved = readCols(id);
    if (saved) setVisible(saved.filter((k) => columns.some((c) => c.key === k)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const params: Params = useMemo(
    () => ({ ...filters, page: query.page, page_size: query.page_size, sort: query.sort || undefined, dir: query.dir }),
    [filters, query.page, query.page_size, query.sort, query.dir]
  );
  const paramsKey = JSON.stringify(params);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    fetcher(JSON.parse(paramsKey) as Params)
      .then((page) => {
        if (!alive) return;
        setData(page);
        onLoaded?.(page);
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setError({ status: e instanceof ApiError ? e.status : 0, message: (e as Error).message });
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // `fetcher` et `onLoaded` sont stables du point de vue de la page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramsKey, reloadToken, retry]);

  useEffect(() => setSelected(new Set()), [paramsKey, reloadToken]);

  const shown = columns.filter((c) => visible.includes(c.key));
  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const page = Number(query.page) || 1;
  const size = Number(query.page_size) || 25;
  const pages = Math.max(1, Math.ceil(total / size));
  const allOnPage = items.length > 0 && items.every((r) => selected.has(rowKey(r)));

  const toggleCol = (key: string) => {
    const next = visible.includes(key) ? visible.filter((k) => k !== key) : columns.filter((c) => c.key === key || visible.includes(c.key)).map((c) => c.key);
    setVisible(next);
    try {
      localStorage.setItem(`smz_cols_${id}`, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  const sortBy = (col: Column<T>) => {
    if (!col.sort) return;
    if (query.sort === col.sort) onQuery({ dir: query.dir === "asc" ? "desc" : "asc" }, true);
    else onQuery({ sort: col.sort, dir: "desc" }, true);
  };

  const doExport = async () => {
    if (!exportPath) return;
    setExporting(true);
    try {
      await exportTable(exportPath, { ...filters, sort: query.sort || undefined, dir: query.dir }, exportName ?? id);
    } catch (e) {
      toast((e as Error).message, { error: true });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="adTableWrap">
      <div className="adPager" style={{ borderTop: 0, borderBottom: "1px solid var(--border)" }}>
        <span>
          {loading && !data ? "Chargement…" : `${total.toLocaleString("fr-FR")} résultat${total > 1 ? "s" : ""}`}
        </span>
        <span className="adSpacer" />
        {exportPath && (
          <Button variant="secondary" className="adBtnSm" onClick={doExport} disabled={exporting || total === 0}>
            <IconDownload size={15} /> {exporting ? "Export…" : "Exporter (CSV)"}
          </Button>
        )}
        <div className="adColumns">
          <Button variant="secondary" className="adBtnSm" onClick={() => setMenu((m) => !m)} aria-expanded={menu}>
            <IconColumns size={15} /> Colonnes
          </Button>
          {menu && (
            <div className="adMenu" onMouseLeave={() => setMenu(false)}>
              {columns.map((c) => (
                <label key={c.key}>
                  <input type="checkbox" checked={visible.includes(c.key)} onChange={() => toggleCol(c.key)} />
                  {c.label}
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      {selectable && selected.size > 0 && bulk && (
        <div className="adBulk">
          <strong>{selected.size} sélectionné(s)</strong>
          {bulk(Array.from(selected), () => {
            setSelected(new Set());
            setRetry((r) => r + 1);
          })}
          <button className="btn btnGhost adBtnSm" onClick={() => setSelected(new Set())}>
            Désélectionner
          </button>
        </div>
      )}

      {error ? (
        <div className="adState" role="alert">
          <h3>{error.status === 403 ? "Accès non autorisé" : error.status === 0 ? "Connexion impossible" : "Erreur de chargement"}</h3>
          <p>
            {error.status === 403
              ? "Votre rôle d'administration ne donne pas accès à cette liste."
              : error.status === 0
                ? "Vérifiez votre connexion internet puis réessayez."
                : error.message}
          </p>
          {error.status !== 403 && (
            <Button variant="secondary" onClick={() => setRetry((r) => r + 1)}>
              <IconRetry size={16} /> Réessayer
            </Button>
          )}
        </div>
      ) : !loading && items.length === 0 ? (
        <div className="adState">
          <h3>{empty?.title ?? "Aucun résultat"}</h3>
          <p>{empty?.body ?? "Élargissez les filtres ou modifiez la recherche."}</p>
        </div>
      ) : (
        <div className="adTableScroll" aria-busy={loading}>
          <table className="adTable">
            <thead>
              <tr>
                {selectable && (
                  <th className="adCheck">
                    <input
                      type="checkbox"
                      aria-label="Tout sélectionner sur la page"
                      checked={allOnPage}
                      onChange={() => {
                        const next = new Set(selected);
                        items.forEach((r) => (allOnPage ? next.delete(rowKey(r)) : next.add(rowKey(r))));
                        setSelected(next);
                      }}
                    />
                  </th>
                )}
                {shown.map((c) => (
                  <th key={c.key} style={c.align === "right" ? { textAlign: "right" } : undefined} aria-sort={query.sort === c.sort ? (query.dir === "asc" ? "ascending" : "descending") : undefined}>
                    {c.sort ? (
                      <button onClick={() => sortBy(c)}>
                        {c.label}
                        {query.sort === c.sort ? (query.dir === "asc" ? <IconSortUp size={12} /> : <IconSortDown size={12} />) : <IconSort size={12} />}
                      </button>
                    ) : (
                      c.label
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && !data
                ? Array.from({ length: 6 }, (_, i) => (
                    <tr key={`sk-${i}`}>
                      {selectable && <td />}
                      {shown.map((c) => (
                        <td key={c.key} data-label={c.label}>
                          <div className="adSkeleton" style={{ width: `${50 + ((i * 17) % 40)}%` }} />
                        </td>
                      ))}
                    </tr>
                  ))
                : items.map((row) => {
                    const k = rowKey(row);
                    const href = rowHref?.(row);
                    return (
                      <tr
                        key={k}
                        className={`${selected.has(k) ? "adRowSelected" : ""} ${href ? "adRowLink" : ""}`}
                        onClick={(e) => {
                          if (!href) return;
                          const target = e.target as HTMLElement;
                          if (target.closest("a,button,input,select,textarea,label")) return;
                          router.push(href);
                        }}
                      >
                        {selectable && (
                          <td className="adCheck" data-label="">
                            <input
                              type="checkbox"
                              aria-label="Sélectionner la ligne"
                              checked={selected.has(k)}
                              onChange={() => {
                                const next = new Set(selected);
                                if (next.has(k)) next.delete(k);
                                else next.add(k);
                                setSelected(next);
                              }}
                            />
                          </td>
                        )}
                        {shown.map((c, i) => (
                          <td key={c.key} data-label={c.label} className={c.align === "right" ? "adCellNum" : undefined}>
                            {i === 0 && href ? (
                              <Link href={href}>{c.render ? c.render(row) : String((row as Record<string, unknown>)[c.key] ?? "—")}</Link>
                            ) : c.render ? (
                              c.render(row)
                            ) : (
                              String((row as Record<string, unknown>)[c.key] ?? "—")
                            )}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
            </tbody>
          </table>
        </div>
      )}

      <div className="adPager">
        <Button variant="secondary" className="adBtnSm" disabled={page <= 1 || loading} onClick={() => onQuery({ page: String(page - 1) }, true)}>
          Précédent
        </Button>
        <span>
          Page {page} / {pages}
        </span>
        <Button variant="secondary" className="adBtnSm" disabled={page >= pages || loading} onClick={() => onQuery({ page: String(page + 1) }, true)}>
          Suivant
        </Button>
        <span className="adSpacer" />
        <label>
          Lignes par page{" "}
          <select value={size} onChange={(e) => onQuery({ page_size: e.target.value })}>
            {[25, 50, 100, 200].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}

// --- Filtres -------------------------------------------------------------------------

export function FilterText({
  label,
  value,
  onChange,
  placeholder,
  wide,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  wide?: boolean;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  useEffect(() => {
    if (draft === value) return;
    const t = setTimeout(() => onChange(draft), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);
  return (
    <label className={`adFilter ${wide ? "adFilterWide" : ""}`}>
      <span>{label}</span>
      <input className="input" value={draft} placeholder={placeholder} onChange={(e) => setDraft(e.target.value)} />
    </label>
  );
}

export function FilterSelect({
  label,
  value,
  onChange,
  options,
  allLabel = "Tous",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[] | Record<string, string>;
  allLabel?: string | null;
}) {
  const opts = Array.isArray(options) ? options : Object.entries(options).map(([value, label]) => ({ value, label }));
  return (
    <label className="adFilter">
      <span>{label}</span>
      <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
        {allLabel !== null && <option value="">{allLabel}</option>}
        {opts.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function FilterDate({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="adFilter">
      <span>{label}</span>
      <input className="input" type="date" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

/** Valeurs par defaut communes a toutes les listes. */
export const TABLE_DEFAULTS = { page: "1", page_size: "25", sort: "", dir: "desc" };

export function tableQuery(state: Record<string, string>) {
  return { page: state.page, page_size: state.page_size, sort: state.sort, dir: state.dir };
}

/** Filtres = tout l'etat sauf pagination et tri. */
export function filtersOf(state: Record<string, string>, omit: string[] = []): Params {
  const out: Params = {};
  Object.entries(state).forEach(([k, v]) => {
    if (!["page", "page_size", "sort", "dir", ...omit].includes(k) && v !== "") out[k] = v;
  });
  return out;
}
