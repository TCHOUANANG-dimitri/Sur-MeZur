"use client";

/**
 * Carnet de travaux (B3.5) : vetements commandes en direct (hors plateforme).
 * Client, description, photo du modele (optionnelle, non imposee dans cette
 * version), date de livraison, statut (a faire, en cours, pret, livre), prix
 * convenu, avance recue et reste a payer — simple note de calcul, AUCUNE
 * transaction. Filtres « cette semaine », « en retard ».
 */

import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { TailorApi } from "@/lib/api/tailor";
import type { TailorClient, TailorJob, TailorJobStatus } from "@/lib/api/tailor";
import { Button, Chip, EmptyState, ErrorBanner, Input, PageHeader, Spinner, Textarea } from "@/components/ui";
import { IconOrders } from "@/components/icons";
import { JobBadge, dueLabel, formatDateFR, formatFcfa } from "../_components";

type Filter = "all" | "week" | "late" | TailorJobStatus;

const NEXT_STATUS: Record<TailorJobStatus, { next: TailorJobStatus; label: string } | null> = {
  todo: { next: "doing", label: "Commencer" },
  doing: { next: "ready", label: "Marquer prêt" },
  ready: { next: "delivered", label: "Marquer livré" },
  delivered: null,
};

function TravauxInner() {
  const params = useSearchParams();
  const [filter, setFilter] = useState<Filter>(
    params.get("filtre") === "retard" ? "late" : params.get("filtre") === "semaine" ? "week" : "all"
  );
  const [jobs, setJobs] = useState<TailorJob[] | null>(null);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(params.get("nouveau") === "1");
  const [clients, setClients] = useState<TailorClient[]>([]);
  const [clientId, setClientId] = useState(params.get("client") ?? "");
  const [clientName, setClientName] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [price, setPrice] = useState("");
  const [deposit, setDeposit] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const query: { status?: string; due?: "week" | "late" } =
        filter === "week" || filter === "late"
          ? { due: filter }
          : filter === "all"
            ? {}
            : { status: filter };
      setJobs(await TailorApi.jobs(query));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chargement impossible.");
      setJobs([]);
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    TailorApi.clients().then(setClients).catch(() => setClients([]));
  }, []);

  useEffect(() => {
    if (clientId && !clientName) {
      const found = clients.find((c) => c.id === clientId);
      if (found) setClientName(found.name);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clients, clientId]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await TailorApi.createJob({
        ...(clientId ? { tailor_client_id: clientId } : {}),
        client_name: clientName.trim(),
        description: description.trim(),
        ...(dueDate ? { due_date: dueDate } : {}),
        ...(price ? { price: Number(price) } : {}),
        ...(deposit ? { deposit: Number(deposit) } : {}),
      });
      setClientId("");
      setClientName("");
      setDescription("");
      setDueDate("");
      setPrice("");
      setDeposit("");
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Création impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function advance(job: TailorJob) {
    const step = NEXT_STATUS[job.status];
    if (!step) return;
    try {
      await TailorApi.patchJob(job.id, { status: step.next });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Mise à jour impossible.");
    }
  }

  async function remove(job: TailorJob) {
    if (!window.confirm(`Supprimer « ${job.description} » ?`)) return;
    try {
      await TailorApi.deleteJob(job.id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Suppression impossible.");
    }
  }

  const priceNum = Number(price);
  const depositNum = Number(deposit);
  const reste = price && deposit && isFinite(priceNum) && isFinite(depositNum) ? priceNum - depositNum : null;

  const filters: { key: Filter; label: string }[] = [
    { key: "all", label: "Tous" },
    { key: "week", label: "Cette semaine" },
    { key: "late", label: "En retard" },
    { key: "todo", label: "À faire" },
    { key: "doing", label: "En cours" },
    { key: "ready", label: "Prêts" },
    { key: "delivered", label: "Livrés" },
  ];

  return (
    <div className="tPage">
      <PageHeader
        title="Travaux"
        action={
          <Button variant="secondary" onClick={() => setShowForm((s) => !s)}>
            {showForm ? "Fermer" : "+ Nouveau"}
          </Button>
        }
      />
      <ErrorBanner message={error} />

      {showForm && (
        <form onSubmit={create} className="card" noValidate>
          <label className="field">
            <span className="fieldLabel">Client du carnet</span>
            <select className="input" value={clientId} onChange={(e) => setClientId(e.target.value)}>
              <option value="">Hors carnet (nom libre ci-dessous)</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name} — {c.phone}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="fieldLabel">Nom du client</span>
            <Input value={clientName} onChange={(e) => setClientName(e.target.value)} />
          </label>
          <label className="field">
            <span className="fieldLabel">Description du vêtement</span>
            <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex. Robe de soirée en wax, manches longues" />
          </label>
          <label className="field">
            <span className="fieldLabel">Date de livraison</span>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </label>
          <div className="fieldRow">
            <label className="field">
              <span className="fieldLabel">Prix convenu (FCFA)</span>
              <Input type="number" inputMode="numeric" min={0} value={price} onChange={(e) => setPrice(e.target.value)} />
            </label>
            <label className="field">
              <span className="fieldLabel">Avance reçue (FCFA)</span>
              <Input type="number" inputMode="numeric" min={0} value={deposit} onChange={(e) => setDeposit(e.target.value)} />
            </label>
          </div>
          {reste !== null && (
            <p className="muted">Reste à payer : <strong>{formatFcfa(reste)}</strong> (simple note, aucun paiement dans l&apos;application).</p>
          )}
          <Button type="submit" block disabled={clientName.trim().length < 2 || description.trim().length < 3 || busy}>
            {busy ? "Création…" : "Ajouter le travail"}
          </Button>
        </form>
      )}

      <div className="tFilters" role="group" aria-label="Filtrer les travaux">
        {filters.map((f) => (
          <Chip key={f.key} active={filter === f.key} onClick={() => setFilter(f.key)}>
            {f.label}
          </Chip>
        ))}
      </div>

      {jobs === null ? (
        <Spinner label="Chargement…" />
      ) : jobs.length === 0 ? (
        <EmptyState
          icon={<IconOrders size={30} strokeWidth={1.6} />}
          title="Aucun travail ici"
          body="Ajoutez un travail : client, description, date de livraison."
        />
      ) : (
        <ul className="tList">
          {jobs.map((job) => {
            const step = NEXT_STATUS[job.status];
            const resteJob =
              job.price != null && job.deposit != null ? job.price - job.deposit : null;
            return (
              <li key={job.id} className="card">
                <div className="tHeader">
                  <span style={{ flex: 1 }}>
                    <strong>{job.client_name}</strong>
                    <br />
                    <span className="tRowSub">{job.description}</span>
                  </span>
                  <JobBadge status={job.status} />
                </div>
                <p className="tRowSub" style={{ margin: "8px 0" }}>
                  Échéance : {job.due_date ? `${formatDateFR(job.due_date)} (${dueLabel(job.due_date)})` : "—"}
                  {job.price != null && <> · Prix : {formatFcfa(job.price)}</>}
                  {job.deposit != null && <> · Avance : {formatFcfa(job.deposit)}</>}
                  {resteJob !== null && <> · Reste : <strong>{formatFcfa(resteJob)}</strong></>}
                </p>
                <div className="tActionRow">
                  {step ? (
                    <Button variant="secondary" onClick={() => void advance(job)}>
                      {step.label}
                    </Button>
                  ) : (
                    <span className="tRowSub">Travail terminé.</span>
                  )}
                  <Button variant="ghost" onClick={() => void remove(job)}>
                    Supprimer
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default function Travaux() {
  return (
    <Suspense fallback={<Spinner label="Chargement…" />}>
      <TravauxInner />
    </Suspense>
  );
}
