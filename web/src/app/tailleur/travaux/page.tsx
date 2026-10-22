"use client";

/**
 * Carnet de travaux (B3.5) : vetements commandes en direct (hors plateforme).
 * Client, description, photo du modele (optionnelle, non imposee dans cette
 * version), date de livraison, statut (a faire, en cours, pret, livre), prix
 * convenu, avance recue et reste a payer — simple note de calcul, AUCUNE
 * transaction. Filtre en menu deroulant : echeance (cette semaine, en
 * retard) ou statut.
 *
 * Controles de saisie : un nouveau client a un nom et un numero valides (sa
 * fiche est creee au passage), la date de livraison n'est pas passee, les
 * montants sont des entiers et l'avance ne depasse pas le prix.
 */

import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { TailorApi } from "@/lib/api/tailor";
import type { TailorClient, TailorJob, TailorJobStatus } from "@/lib/api/tailor";
import { Button, EmptyState, ErrorBanner, Input, PageHeader, Select, Spinner, Textarea } from "@/components/ui";
import { PhoneField } from "@/components/fields";
import { IconOrders } from "@/components/icons";
import { COUNTRIES, splitPhone } from "@/lib/countries";
import { amountError, nameError, phoneError, todayISO } from "@/lib/validation";
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
  const [clientPhone, setClientPhone] = useState(COUNTRIES[0].dial);
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

  // Controles de saisie : un message n'apparait que sur un champ rempli.
  const nouveauClient = !clientId;
  const nameErr = nouveauClient && clientName.trim() ? nameError(clientName) : null;
  const phoneErr = nouveauClient && splitPhone(clientPhone).local ? phoneError(clientPhone) : null;
  const descriptionErr =
    description.trim() && description.trim().length < 3 ? "Décrivez le vêtement en quelques mots." : null;
  const today = todayISO();
  const dateErr = dueDate && dueDate < today ? "La date de livraison ne peut pas être passée." : null;
  const priceErr = amountError(price);
  const depositErr =
    amountError(deposit) ??
    (price && deposit && !priceErr && Number(deposit) > Number(price) ? "L'avance ne peut pas dépasser le prix." : null);
  const canCreate =
    (!nouveauClient || (!nameError(clientName) && !phoneError(clientPhone))) &&
    description.trim().length >= 3 &&
    !dateErr &&
    !priceErr &&
    !depositErr &&
    !busy;

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!canCreate) return;
    setError("");
    setBusy(true);
    try {
      await TailorApi.createJob({
        ...(clientId ? { tailor_client_id: clientId } : {}),
        client_name: clientName.trim(),
        ...(nouveauClient ? { client_phone: clientPhone } : {}),
        description: description.trim(),
        ...(dueDate ? { due_date: dueDate } : {}),
        ...(price ? { price: Number(price) } : {}),
        ...(deposit ? { deposit: Number(deposit) } : {}),
      });
      setClientId("");
      setClientName("");
      setClientPhone(COUNTRIES[0].dial);
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
  const reste =
    price && deposit && !priceErr && !depositErr && isFinite(priceNum) && isFinite(depositNum) ? priceNum - depositNum : null;

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
            <span className="fieldLabel">Client</span>
            <select
              className="input"
              value={clientId}
              onChange={(e) => {
                setClientId(e.target.value);
                setClientName(clients.find((c) => c.id === e.target.value)?.name ?? "");
              }}
            >
              <option value="">Nouveau client</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.phone ? ` — ${c.phone}` : ""}
                </option>
              ))}
            </select>
          </label>
          {nouveauClient && (
            <>
              <label className="field">
                <span className="fieldLabel">Nom du client</span>
                <Input
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  autoComplete="name"
                  maxLength={120}
                  aria-invalid={nameErr ? true : undefined}
                />
                {nameErr && <span className="fieldError">{nameErr}</span>}
              </label>
              <PhoneField label="Téléphone du client" value={clientPhone} onChange={setClientPhone} error={phoneErr} />
              <p className="fieldHint" style={{ marginTop: -8 }}>
                Le client est ajouté à votre carnet.
              </p>
            </>
          )}
          <label className="field">
            <span className="fieldLabel">Description du vêtement</span>
            <Textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex. Robe de soirée en wax, manches longues"
              maxLength={2000}
              aria-invalid={descriptionErr ? true : undefined}
            />
            {descriptionErr && <span className="fieldError">{descriptionErr}</span>}
          </label>
          <label className="field">
            <span className="fieldLabel">Date de livraison</span>
            <Input
              type="date"
              min={today}
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              aria-invalid={dateErr ? true : undefined}
            />
            {dateErr && <span className="fieldError">{dateErr}</span>}
          </label>
          <div className="fieldRow">
            <label className="field">
              <span className="fieldLabel">Prix convenu (FCFA)</span>
              <Input
                inputMode="numeric"
                value={price}
                onChange={(e) => setPrice(e.target.value.replace(/[\s.]/g, ""))}
                placeholder="15000"
                aria-invalid={priceErr ? true : undefined}
              />
              {priceErr && <span className="fieldError">{priceErr}</span>}
            </label>
            <label className="field">
              <span className="fieldLabel">Avance reçue (FCFA)</span>
              <Input
                inputMode="numeric"
                value={deposit}
                onChange={(e) => setDeposit(e.target.value.replace(/[\s.]/g, ""))}
                placeholder="5000"
                aria-invalid={depositErr ? true : undefined}
              />
              {depositErr && <span className="fieldError">{depositErr}</span>}
            </label>
          </div>
          {reste !== null && (
            <p className="muted">Reste à payer : <strong>{formatFcfa(reste)}</strong> (simple note, aucun paiement dans l&apos;application).</p>
          )}
          <Button type="submit" block disabled={!canCreate}>
            {busy ? "Création…" : "Ajouter le travail"}
          </Button>
        </form>
      )}

      {/* Menu deroulant, comme le catalogue : la place reste la meme quel que
          soit le nombre de filtres. */}
      <label className={`filterSelect ${filter !== "all" ? "filterSelectOn" : ""}`}>
        <span>Afficher</span>
        <Select value={filter} onChange={(e) => setFilter(e.target.value as Filter)}>
          <option value="all">Tous les travaux</option>
          <optgroup label="Échéance">
            <option value="week">À livrer cette semaine</option>
            <option value="late">En retard</option>
          </optgroup>
          <optgroup label="Statut">
            <option value="todo">À faire</option>
            <option value="doing">En cours</option>
            <option value="ready">Prêts</option>
            <option value="delivered">Livrés</option>
          </optgroup>
        </Select>
      </label>

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
                    <strong>{job.client_name || "Client retiré du carnet"}</strong>
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
