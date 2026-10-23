"use client";

/**
 * Recettes de l'atelier : un carnet de ce que le tailleur a encaisse.
 *
 * Aucun paiement ne passe par l'application : le tailleur note ce qu'il a
 * recu (especes, Mobile Money…), quand, et pour quel travail. Une recette
 * liee a un travail fait monter son avance ; le reste a encaisser se calcule
 * sur les travaux qui ont un prix convenu.
 *
 * `?travail=<id>` (bouton « Encaisser un paiement » des Travaux) ouvre le
 * formulaire avec ce travail deja choisi.
 */

import { locale, tr } from "@/lib/i18n";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { TailorApi } from "@/lib/api/tailor";
import type { Finances, TailorJob } from "@/lib/api/tailor";
import { Button, EmptyState, ErrorBanner, Input, PageHeader, Select, Spinner } from "@/components/ui";
import { IconPlus, IconTrash, IconWallet } from "@/components/icons";
import { amountError, todayISO } from "@/lib/validation";
import { Stat, formatDateFR, formatFcfa } from "../_components";

type Period = "month" | "last" | "3m" | "year" | "all";

const PERIODS: { key: Period; fr: string; en: string }[] = [
  { key: "month", fr: "Ce mois", en: "This month" },
  { key: "last", fr: "Mois dernier", en: "Last month" },
  { key: "3m", fr: "3 derniers mois", en: "Last 3 months" },
  { key: "year", fr: "Cette année", en: "This year" },
  { key: "all", fr: "Tout", en: "All" },
];

const METHODS: Record<string, [string, string]> = {
  cash: ["Espèces", "Cash"],
  mobile_money: ["Mobile Money", "Mobile Money"],
  virement: ["Virement", "Bank transfer"],
  autre: ["Autre", "Other"],
};
const methode = (m: string) => (METHODS[m] ? tr(...METHODS[m]) : m);

/** « oct. » / « Oct » : mois court dans la langue courante. */
const moisCourt = (mois: string) =>
  new Date(Number(mois.slice(0, 4)), Number(mois.slice(5)) - 1, 1).toLocaleDateString(locale(), { month: "short" });

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function bounds(p: Period): { debut?: string; fin?: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (p) {
    case "month":
      return { debut: iso(new Date(y, m, 1)) };
    case "last":
      return { debut: iso(new Date(y, m - 1, 1)), fin: iso(new Date(y, m, 0)) };
    case "3m":
      return { debut: iso(new Date(y, m - 2, 1)) };
    case "year":
      return { debut: iso(new Date(y, 0, 1)) };
    default:
      return {};
  }
}

/** Les six derniers mois, du plus ancien au plus recent : « 2026-05 »… */
function lastSixMonths(): string[] {
  const now = new Date();
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
}

function FinancesInner() {
  const params = useSearchParams();
  const travail = params.get("travail");
  const [period, setPeriod] = useState<Period>("3m");
  const [data, setData] = useState<Finances | null>(null);
  const [history, setHistory] = useState<Finances | null>(null);
  const [jobs, setJobs] = useState<TailorJob[]>([]);
  const [showForm, setShowForm] = useState(Boolean(travail));
  const [amount, setAmount] = useState("");
  const [day, setDay] = useState(todayISO());
  const [label, setLabel] = useState("");
  const [method, setMethod] = useState("cash");
  const [jobId, setJobId] = useState(travail ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const months = lastSixMonths();
      const [d, h] = await Promise.all([
        TailorApi.finances(bounds(period)),
        TailorApi.finances({ debut: `${months[0]}-01` }),
      ]);
      setData(d);
      setHistory(h);
    } catch (e) {
      setError(e instanceof Error ? e.message : tr("Chargement impossible.", "Could not load."));
    }
  }, [period]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    TailorApi.jobs().then(setJobs).catch(() => setJobs([]));
  }, [data]);

  const job = jobs.find((j) => j.id === jobId) ?? null;
  const resteJob = job && job.price != null ? Math.max(0, job.price - (job.deposit ?? 0)) : null;
  const today = todayISO();
  const amountErr =
    amountError(amount, { min: 1 }) ??
    (amount && resteJob !== null && Number(amount) > resteJob
      ? tr(`Reste dû sur ce travail : ${formatFcfa(resteJob)}.`, `Balance due on this job: ${formatFcfa(resteJob)}.`)
      : null);
  const dayErr = day > today ? tr("Date future.", "Date in the future.") : null;
  const canSave = Boolean(amount) && !amountErr && Boolean(day) && !dayErr && label.length <= 255 && !busy;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    setBusy(true);
    setError("");
    try {
      await TailorApi.addIncome({
        amount: Number(amount),
        received_on: day,
        label: label.trim() || null,
        method,
        job_id: jobId || null,
      });
      setAmount("");
      setLabel("");
      setDay(todayISO());
      setJobId("");
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : tr("Enregistrement impossible.", "Could not save."));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string, what: string) {
    if (!window.confirm(tr(`Supprimer « ${what} » ?`, `Delete “${what}”?`))) return;
    try {
      await TailorApi.deleteIncome(id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : tr("Suppression impossible.", "Could not delete."));
    }
  }

  const bars = useMemo(() => {
    const totals = Object.fromEntries((history?.par_mois ?? []).map((m) => [m.mois, m.total]));
    const months = lastSixMonths().map((mois) => ({ mois, total: totals[mois] ?? 0 }));
    const max = Math.max(1, ...months.map((m) => m.total));
    return { months, max };
  }, [history]);

  if (!data) {
    return (
      <div className="tPage">
        <PageHeader title={tr("Recettes", "Income")} back />
        {error ? <ErrorBanner message={error} /> : <Spinner />}
      </div>
    );
  }

  const diff = data.total_mois_courant - data.total_mois_precedent;
  const per = PERIODS.find((p) => p.key === period);
  const periodLabel = per ? tr(per.fr, per.en) : "";

  return (
    <div className="tPage">
      <PageHeader
        title={tr("Recettes", "Income")}
        back
        action={
          <Button variant="secondary" onClick={() => setShowForm((s) => !s)}>
            {showForm ? tr("Fermer", "Close") : <><IconPlus size={16} aria-hidden /> {tr("Ajouter", "Add")}</>}
          </Button>
        }
      />
      <ErrorBanner message={error} />

      <div className="tStats tStatsMoney" role="group" aria-label={tr("Résumé", "Summary")}>
        <Stat label={tr("Ce mois", "This month")} value={formatFcfa(data.total_mois_courant)} />
        <Stat label={periodLabel} value={formatFcfa(data.total_encaisse)} />
        <Stat label={tr("Reste dû", "Balance due")} value={formatFcfa(data.reste_a_encaisser)} alert={data.reste_a_encaisser > 0} />
      </div>
      <p className="tRowSub" style={{ margin: 0 }}>
        {tr("Mois dernier", "Last month")} : {formatFcfa(data.total_mois_precedent)}
        {(data.total_mois_precedent > 0 || data.total_mois_courant > 0) && ` (${diff >= 0 ? "+" : "−"}${formatFcfa(Math.abs(diff))})`}
      </p>

      {showForm && (
        <form className="card" onSubmit={save} noValidate>
          <label className="field">
            <span className="fieldLabel">{tr("Montant (FCFA)", "Amount (FCFA)")}</span>
            <Input
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[\s.]/g, ""))}
              placeholder="5000"
              autoFocus
              aria-invalid={amountErr ? true : undefined}
            />
            {amountErr && <span className="fieldError">{amountErr}</span>}
          </label>
          <label className="field">
            <span className="fieldLabel">{tr("Travail (facultatif)", "Job (optional)")}</span>
            <select className="input" value={jobId} onChange={(e) => setJobId(e.target.value)}>
              <option value="">{tr("Aucun", "None")}</option>
              {jobs
                .filter((j) => j.id === jobId || j.price == null || (j.deposit ?? 0) < j.price)
                .map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.client_name || tr("Client", "Client")} — {j.description.slice(0, 40)}
                    {j.price != null ? ` (${tr("reste", "due")} ${formatFcfa(Math.max(0, j.price - (j.deposit ?? 0)))})` : ""}
                  </option>
                ))}
            </select>

          </label>
          <div className="fieldRow">
            <label className="field">
              <span className="fieldLabel">{tr("Date", "Date")}</span>
              <Input type="date" max={today} value={day} onChange={(e) => setDay(e.target.value)} aria-invalid={dayErr ? true : undefined} />
              {dayErr && <span className="fieldError">{dayErr}</span>}
            </label>
            <label className="field">
              <span className="fieldLabel">{tr("Mode", "Method")}</span>
              <select className="input" value={method} onChange={(e) => setMethod(e.target.value)}>
                {Object.keys(METHODS).map((k) => (
                  <option key={k} value={k}>{methode(k)}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="field">
            <span className="fieldLabel">{tr("Libellé (facultatif)", "Label (optional)")}</span>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={255} placeholder={tr("Ex. solde robe, retouche", "E.g. dress balance, alteration")} />
          </label>
          <Button type="submit" block disabled={!canSave}>
            {busy ? tr("Enregistrement…", "Saving…") : tr("Enregistrer", "Save")}
          </Button>
        </form>
      )}

      <section className="card" aria-labelledby="mois-titre">
        <h2 id="mois-titre" style={{ fontSize: 16, margin: 0 }}>{tr("Six derniers mois", "Last six months")}</h2>
        <ul className="tBars">
          {bars.months.map((m) => (
            <li key={m.mois} title={`${formatFcfa(m.total)}`}>
              <span className="tBarLabel">{m.total > 0 ? `${Math.round(m.total / 1000)}k` : ""}</span>
              <span className="tBar" style={{ height: `${(m.total / bars.max) * 80}%` }} aria-hidden />
              <span className="tBarLabel">{moisCourt(m.mois)}</span>
              <span className="srOnly">{formatFcfa(m.total)}</span>
            </li>
          ))}
        </ul>
      </section>

      <label className={`filterSelect ${period !== "3m" ? "filterSelectOn" : ""}`}>
        <span>{tr("Période", "Period")}</span>
        <Select value={period} onChange={(e) => setPeriod(e.target.value as Period)}>
          {PERIODS.map((p) => (
            <option key={p.key} value={p.key}>{tr(p.fr, p.en)}</option>
          ))}
        </Select>
      </label>

      {data.entrees.length === 0 ? (
        <EmptyState
          icon={<IconWallet size={30} strokeWidth={1.6} />}
          title={tr("Aucune recette", "No income yet")}
        />
      ) : (
        <ul className="tList" aria-label={tr("Recettes", "Income")}>
          {data.entrees.map((e) => (
            <li key={e.id} className="tRow">
              <span className="tRowMain">
                <span className="tRowTitle">{formatFcfa(e.amount)}</span>
                <br />
                <span className="tRowSub">
                  {e.received_on ? formatDateFR(e.received_on) : ""} · {methode(e.method)} · {e.label}
                </span>
              </span>
              <Button variant="ghost" onClick={() => void remove(e.id, e.label)} aria-label={tr("Supprimer", "Delete")}>
                <IconTrash size={18} aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function FinancesPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <FinancesInner />
    </Suspense>
  );
}
