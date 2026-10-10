"use client";

/**
 * Briques partagees de l'espace tailleur (B3) : statistiques, gros boutons,
 * badges de statut, formatage FCFA / dates, selecteur de client et formulaire
 * de saisie manuelle des 12 mensurations.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { TailorApi } from "@/lib/api/tailor";
import type { TailorClient } from "@/lib/api/tailor";
import { MEASURE_ORDER, MEASURES } from "@/lib/measurements";
import { Badge, Button, EmptyState, Input, Spinner } from "@/components/ui";
import { IconSearch, IconUsers } from "@/components/icons";

export function formatFcfa(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `${new Intl.NumberFormat("fr-FR").format(value)} FCFA`;
}

export function formatDateFR(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value.length <= 10 ? `${value}T12:00:00` : value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

/** « Dans 3 j », « Aujourd'hui », « En retard de 2 j ». */
export function dueLabel(dueDate: string | null | undefined): string | null {
  if (!dueDate) return null;
  const due = new Date(`${dueDate}T23:59:59`);
  if (Number.isNaN(due.getTime())) return null;
  const days = Math.ceil((due.getTime() - Date.now()) / 86400000);
  if (days < 0) return `En retard de ${-days} j`;
  if (days === 0) return "Aujourd'hui";
  if (days === 1) return "Demain";
  return `Dans ${days} j`;
}

export function Stat({ label, value, alert, href }: { label: string; value: React.ReactNode; alert?: boolean; href?: string }) {
  const body = (
    <>
      <span className={`tStatValue ${alert ? "tStatValueAlert" : ""}`}>{value}</span>
      <span className="tStatLabel">{label}</span>
    </>
  );
  if (href) {
    return (
      <Link href={href} className="tStat">
        {body}
      </Link>
    );
  }
  return <div className="tStat">{body}</div>;
}

export function BigAction({
  href,
  icon,
  title,
  sub,
  secondary,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  sub?: string;
  secondary?: boolean;
}) {
  return (
    <Link href={href} className={`tBigBtn ${secondary ? "tBigBtnSecondary" : ""}`}>
      <span className="tBigBtnIcon" aria-hidden>
        {icon}
      </span>
      <span>
        {title}
        {sub && <small>{sub}</small>}
      </span>
    </Link>
  );
}

const JOB_STATUS: Record<string, { label: string; tone: "success" | "pending" | "error" | "neutral" }> = {
  todo: { label: "À faire", tone: "pending" },
  doing: { label: "En cours", tone: "neutral" },
  ready: { label: "Prêt", tone: "success" },
  delivered: { label: "Livré", tone: "success" },
};

export function JobBadge({ status }: { status: string }) {
  const m = JOB_STATUS[status];
  return <Badge tone={m?.tone ?? "neutral"}>{m?.label ?? status}</Badge>;
}

const ORDER_STATUS: Record<string, { label: string; tone: "success" | "pending" | "error" | "neutral" }> = {
  new: { label: "Nouvelle", tone: "pending" },
  in_progress: { label: "En cours", tone: "neutral" },
  ready_for_pickup: { label: "Prête", tone: "pending" },
  finished_delivered: { label: "Livrée", tone: "success" },
  finished_not_delivered: { label: "Non retirée", tone: "error" },
  cancelled: { label: "Annulée", tone: "neutral" },
};

export function OrderBadge({ status }: { status: string }) {
  const m = ORDER_STATUS[status];
  return <Badge tone={m?.tone ?? "neutral"}>{m?.label ?? status}</Badge>;
}

export function PatternBadge({ status }: { status: string }) {
  if (status === "ready") return <Badge tone="success">Prêt</Badge>;
  if (status === "failed") return <Badge tone="error">Échec</Badge>;
  return <Badge tone="pending">En cours</Badge>;
}

/** Recherche + selection d'un client du carnet. */
export function ClientPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const [query, setQuery] = useState("");
  const [clients, setClients] = useState<TailorClient[] | null>(null);

  useEffect(() => {
    let alive = true;
    const timer = setTimeout(() => {
      TailorApi.clients(query || undefined)
        .then((list) => alive && setClients(list))
        .catch(() => alive && setClients([]));
    }, 250);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [query]);

  return (
    <div className="field">
      <span className="fieldLabel">Client du carnet</span>
      <div className="tSearch">
        <Input
          placeholder="Rechercher par nom ou téléphone…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Rechercher un client"
        />
      </div>
      {clients === null ? (
        <Spinner label="Chargement…" />
      ) : clients.length === 0 ? (
        <EmptyState
          icon={<IconUsers size={26} strokeWidth={1.6} />}
          title="Aucun client"
          body={query ? "Aucun client ne correspond. Ajoutez-le depuis le carnet." : "Ajoutez votre premier client depuis le carnet."}
          action={
            <Link href="/tailleur/clients">
              <Button variant="secondary">Ouvrir le carnet</Button>
            </Link>
          }
        />
      ) : (
        <ul className="tList">
          {clients.slice(0, 8).map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className={`tRow ${value === c.id ? "tRowActive" : ""}`}
                onClick={() => onChange(c.id)}
                aria-pressed={value === c.id}
                style={{ width: "100%", cursor: "pointer", borderColor: value === c.id ? "var(--violet-primary)" : undefined }}
              >
                <span className="tAvatar" aria-hidden>
                  {c.name.trim().charAt(0).toUpperCase() || <IconSearch size={18} />}
                </span>
                <span className="tRowMain">
                  <span className="tRowTitle">{c.name}</span>
                  <br />
                  <span className="tRowSub">{c.phone}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Saisie manuelle des 12 mensurations au metre ruban, avec les memes libelles
 * que `src/lib/measurements.ts`. Retourne les valeurs + la taille.
 */
export function ManualMeasureForm({
  onSubmit,
  busy,
  submitLabel = "Enregistrer",
}: {
  onSubmit: (data: Record<string, number>, heightCm: number) => void | Promise<void>;
  busy?: boolean;
  submitLabel?: string;
}) {
  const [height, setHeight] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});

  function set(key: string, raw: string) {
    setValues((v) => ({ ...v, [key]: raw.replace(",", ".") }));
  }

  const parsed: Record<string, number> = {};
  for (const key of MEASURE_ORDER) {
    const n = Number(values[key]);
    if (values[key] !== undefined && values[key] !== "" && isFinite(n) && n > 0 && n < 300) {
      parsed[key] = Math.round(n * 10) / 10;
    }
  }
  const count = Object.keys(parsed).length;
  const heightNum = Number(height);
  const valid = count >= 1 && heightNum >= 100 && heightNum <= 230;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) void onSubmit(parsed, heightNum);
      }}
      noValidate
    >
      <div className="field">
        <span className="fieldLabel">Taille du client (cm)</span>
        <Input
          type="number"
          inputMode="numeric"
          min={100}
          max={230}
          placeholder="175"
          value={height}
          onChange={(e) => setHeight(e.target.value)}
        />
      </div>
      <div className="tMeasureGrid">
        {MEASURE_ORDER.map((key) => (
          <label className="field" key={key}>
            <span className="fieldLabel">{MEASURES[key].label} (cm)</span>
            <Input
              type="number"
              inputMode="decimal"
              min={1}
              max={300}
              step="0.5"
              placeholder="—"
              value={values[key] ?? ""}
              onChange={(e) => set(key, e.target.value)}
            />
          </label>
        ))}
      </div>
      <p className="muted">
        {count === 0 ? "Saisissez au moins une mesure." : `${count} mesure${count > 1 ? "s" : ""} saisie${count > 1 ? "s" : ""}.`}
      </p>
      <Button type="submit" block disabled={!valid || busy}>
        {busy ? "Enregistrement…" : submitLabel}
      </Button>
    </form>
  );
}
