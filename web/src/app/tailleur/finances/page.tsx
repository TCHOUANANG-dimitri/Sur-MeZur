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

import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { TailorApi } from "@/lib/api/tailor";
import type { Finances, TailorJob } from "@/lib/api/tailor";
import { Button, EmptyState, ErrorBanner, Input, PageHeader, Select, Spinner } from "@/components/ui";
import { IconPlus, IconTrash, IconWallet } from "@/components/icons";
import { amountError, todayISO } from "@/lib/validation";
import { Stat, formatDateFR, formatFcfa } from "../_components";

type Period = "month" | "last" | "3m" | "year" | "all";

const PERIODS: { key: Period; label: string }[] = [
  { key: "month", label: "Ce mois" },
  { key: "last", label: "Mois dernier" },
  { key: "3m", label: "3 derniers mois" },
  { key: "year", label: "Cette année" },
  { key: "all", label: "Tout" },
];

const METHODS: Record<string, string> = {
  cash: "Espèces",
  mobile_money: "Mobile Money",
  virement: "Virement",
  autre: "Autre",
};

const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

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
      setError(e instanceof Error ? e.message : "Chargement impossible.");
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
      ? `Ce travail n'attend plus que ${formatFcfa(resteJob)}.`
      : null);
  const dayErr = day > today ? "La date ne peut pas être dans le futur." : null;
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
      setError(err instanceof Error ? err.message : "Enregistrement impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string, what: string) {
    if (!window.confirm(`Supprimer la recette « ${what} » ?`)) return;
    try {
      await TailorApi.deleteIncome(id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Suppression impossible.");
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
        <PageHeader title="Recettes" back />
        {error ? <ErrorBanner message={error} /> : <Spinner label="Chargement…" />}
      </div>
    );
  }

  const diff = data.total_mois_courant - data.total_mois_precedent;
  const periodLabel = PERIODS.find((p) => p.key === period)?.label.toLowerCase() ?? "";

  return (
    <div className="tPage">
      <PageHeader
        title="Recettes"
        back
        action={
          <Button variant="secondary" onClick={() => setShowForm((s) => !s)}>
            {showForm ? "Fermer" : <><IconPlus size={16} aria-hidden /> Ajouter</>}
          </Button>
        }
      />
      <ErrorBanner message={error} />
      <p className="tRowSub" style={{ margin: 0 }}>
        Ce que vous avez encaissé, noté par vous. Aucun paiement ne passe par l&apos;application.
      </p>

      <div className="tStats tStatsMoney" role="group" aria-label="Résumé des recettes">
        <Stat label="Encaissé ce mois" value={formatFcfa(data.total_mois_courant)} />
        <Stat label={`Encaissé (${periodLabel})`} value={formatFcfa(data.total_encaisse)} />
        <Stat label="Reste à encaisser" value={formatFcfa(data.reste_a_encaisser)} alert={data.reste_a_encaisser > 0} />
      </div>
      <p className="tRowSub" style={{ margin: 0 }}>
        Mois dernier : {formatFcfa(data.total_mois_precedent)}
        {(data.total_mois_precedent > 0 || data.total_mois_courant > 0) &&
          ` · ce mois ${diff >= 0 ? "+" : "−"}${formatFcfa(Math.abs(diff))}`}
      </p>

      {showForm && (
        <form className="card" onSubmit={save} noValidate>
          <label className="field">
            <span className="fieldLabel">Montant reçu (FCFA)</span>
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
            <span className="fieldLabel">Travail concerné (facultatif)</span>
            <select className="input" value={jobId} onChange={(e) => setJobId(e.target.value)}>
              <option value="">Aucun : autre recette</option>
              {jobs
                .filter((j) => j.id === jobId || j.price == null || (j.deposit ?? 0) < j.price)
                .map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.client_name || "Client"} — {j.description.slice(0, 40)}
                    {j.price != null ? ` (reste ${formatFcfa(Math.max(0, j.price - (j.deposit ?? 0)))})` : ""}
                  </option>
                ))}
            </select>
            {job && <span className="fieldHint">L&apos;avance de ce travail sera mise à jour.</span>}
          </label>
          <div className="fieldRow">
            <label className="field">
              <span className="fieldLabel">Date</span>
              <Input type="date" max={today} value={day} onChange={(e) => setDay(e.target.value)} aria-invalid={dayErr ? true : undefined} />
              {dayErr && <span className="fieldError">{dayErr}</span>}
            </label>
            <label className="field">
              <span className="fieldLabel">Mode</span>
              <select className="input" value={method} onChange={(e) => setMethod(e.target.value)}>
                {Object.entries(METHODS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="field">
            <span className="fieldLabel">Libellé (facultatif)</span>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={255} placeholder="Ex. Solde robe de Mme Awa, retouche" />
          </label>
          <Button type="submit" block disabled={!canSave}>
            {busy ? "Enregistrement…" : "Enregistrer la recette"}
          </Button>
        </form>
      )}

      <section className="card" aria-labelledby="mois-titre">
        <h2 id="mois-titre" style={{ fontSize: 16, margin: 0 }}>Six derniers mois</h2>
        <ul className="tBars">
          {bars.months.map((m) => (
            <li key={m.mois} title={`${formatFcfa(m.total)}`}>
              <span className="tBarLabel">{m.total > 0 ? `${Math.round(m.total / 1000)}k` : ""}</span>
              <span className="tBar" style={{ height: `${(m.total / bars.max) * 80}%` }} aria-hidden />
              <span className="tBarLabel">{MONTHS[Number(m.mois.slice(5)) - 1]}</span>
              <span className="srOnly">{formatFcfa(m.total)}</span>
            </li>
          ))}
        </ul>
      </section>

      <label className={`filterSelect ${period !== "3m" ? "filterSelectOn" : ""}`}>
        <span>Période</span>
        <Select value={period} onChange={(e) => setPeriod(e.target.value as Period)}>
          {PERIODS.map((p) => (
            <option key={p.key} value={p.key}>{p.label}</option>
          ))}
        </Select>
      </label>

      {data.entrees.length === 0 ? (
        <EmptyState
          icon={<IconWallet size={30} strokeWidth={1.6} />}
          title="Aucune recette sur cette période"
          body="Notez chaque paiement reçu : avance, solde, retouche. Vous verrez ce que rapporte l'atelier."
        />
      ) : (
        <ul className="tList" aria-label="Recettes">
          {data.entrees.map((e) => (
            <li key={e.id} className="tRow">
              <span className="tRowMain">
                <span className="tRowTitle">{formatFcfa(e.amount)}</span>
                <br />
                <span className="tRowSub">
                  {e.received_on ? formatDateFR(e.received_on) : ""} · {METHODS[e.method] ?? e.method} · {e.label}
                </span>
              </span>
              <Button variant="ghost" onClick={() => void remove(e.id, e.label)} aria-label={`Supprimer la recette ${e.label}`}>
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
    <Suspense fallback={<Spinner label="Chargement…" />}>
      <FinancesInner />
    </Suspense>
  );
}
