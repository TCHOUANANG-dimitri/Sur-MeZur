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
import { measureError } from "@/lib/validation";
import { Badge, Button, EmptyState, Input, Spinner } from "@/components/ui";
import { IconSearch, IconUsers } from "@/components/icons";
import { locale, tr } from "@/lib/i18n";

export function formatFcfa(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `${new Intl.NumberFormat(locale()).format(value)} FCFA`;
}

export function formatDateFR(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value.length <= 10 ? `${value}T12:00:00` : value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(locale(), { day: "numeric", month: "short", year: "numeric" });
}

/** « Dans 3 j », « Aujourd'hui », « En retard de 2 j ». */
export function dueLabel(dueDate: string | null | undefined): string | null {
  if (!dueDate) return null;
  const due = new Date(`${dueDate}T23:59:59`);
  if (Number.isNaN(due.getTime())) return null;
  const days = Math.ceil((due.getTime() - Date.now()) / 86400000);
  if (days < 0) return tr(`En retard de ${-days} j`, `${-days} d late`);
  if (days === 0) return tr("Aujourd'hui", "Today");
  if (days === 1) return tr("Demain", "Tomorrow");
  return tr(`Dans ${days} j`, `In ${days} d`);
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

type Tone = "success" | "pending" | "error" | "neutral";

const JOB_STATUS: Record<string, { fr: string; en: string; tone: Tone }> = {
  todo: { fr: "À faire", en: "To do", tone: "pending" },
  doing: { fr: "En cours", en: "In progress", tone: "neutral" },
  ready: { fr: "Prêt", en: "Ready", tone: "success" },
  delivered: { fr: "Livré", en: "Delivered", tone: "success" },
};

export function JobBadge({ status }: { status: string }) {
  const m = JOB_STATUS[status];
  return <Badge tone={m?.tone ?? "neutral"}>{m ? tr(m.fr, m.en) : status}</Badge>;
}

const ORDER_STATUS: Record<string, { fr: string; en: string; tone: Tone }> = {
  new: { fr: "Nouvelle", en: "New", tone: "pending" },
  in_progress: { fr: "En cours", en: "In progress", tone: "neutral" },
  ready_for_pickup: { fr: "Prête", en: "Ready", tone: "pending" },
  finished_delivered: { fr: "Livrée", en: "Delivered", tone: "success" },
  finished_not_delivered: { fr: "Non retirée", en: "Not collected", tone: "error" },
  cancelled: { fr: "Annulée", en: "Cancelled", tone: "neutral" },
};

export function OrderBadge({ status }: { status: string }) {
  const m = ORDER_STATUS[status];
  return <Badge tone={m?.tone ?? "neutral"}>{m ? tr(m.fr, m.en) : status}</Badge>;
}

export function PatternBadge({ status }: { status: string }) {
  if (status === "ready") return <Badge tone="success">{tr("Prêt", "Ready")}</Badge>;
  if (status === "failed") return <Badge tone="error">{tr("Échec", "Failed")}</Badge>;
  return <Badge tone="pending">{tr("En cours", "In progress")}</Badge>;
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
      <span className="fieldLabel">{tr("Client du carnet", "Client")}</span>
      <div className="tSearch">
        <Input
          placeholder={tr("Nom ou téléphone…", "Name or phone…")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label={tr("Rechercher un client", "Search a client")}
        />
      </div>
      {clients === null ? (
        <Spinner />
      ) : clients.length === 0 ? (
        <EmptyState
          icon={<IconUsers size={26} strokeWidth={1.6} />}
          title={tr("Aucun client", "No clients")}
          action={
            <Link href="/tailleur/clients">
              <Button variant="secondary">{tr("Ouvrir le carnet", "Open client list")}</Button>
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
  submitLabel,
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

  // Une valeur hors plage plausible (lib/validation) est signalee sous son
  // champ et bloque l'enregistrement, au lieu d'etre ignoree en silence.
  const parsed: Record<string, number> = {};
  const errors: Partial<Record<string, string>> = {};
  for (const key of MEASURE_ORDER) {
    const raw = values[key] ?? "";
    const err = measureError(key, raw);
    if (err) errors[key] = err;
    else if (raw.trim()) parsed[key] = Math.round(Number(raw) * 10) / 10;
  }
  const count = Object.keys(parsed).length;
  const heightNum = Number(height.replace(",", "."));
  const heightErr = height.trim() && !(heightNum >= 100 && heightNum <= 230) ? tr("Entre 100 et 230 cm.", "Between 100 and 230 cm.") : null;
  const valid = count >= 1 && !heightErr && height.trim() !== "" && Object.keys(errors).length === 0;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) void onSubmit(parsed, heightNum);
      }}
      noValidate
    >
      <div className="field">
        <span className="fieldLabel">{tr("Taille du client (cm)", "Client's height (cm)")}</span>
        <Input
          type="number"
          inputMode="numeric"
          min={100}
          max={230}
          placeholder="175"
          value={height}
          onChange={(e) => setHeight(e.target.value)}
          aria-invalid={heightErr ? true : undefined}
        />
        {heightErr && <span className="fieldError">{heightErr}</span>}
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
              aria-invalid={errors[key] ? true : undefined}
            />
            {errors[key] && <span className="fieldError">{errors[key]}</span>}
          </label>
        ))}
      </div>
      <p className="muted">
        {count === 0
          ? tr("Au moins une mesure.", "At least one measurement.")
          : tr(`${count} mesure${count > 1 ? "s" : ""}`, `${count} measurement${count > 1 ? "s" : ""}`)}
      </p>
      <Button type="submit" block disabled={!valid || busy}>
        {busy ? tr("Enregistrement…", "Saving…") : submitLabel ?? tr("Enregistrer", "Save")}
      </Button>
    </form>
  );
}
