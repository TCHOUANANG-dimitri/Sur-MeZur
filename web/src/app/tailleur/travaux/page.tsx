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

import { tr } from "@/lib/i18n";
import Link from "next/link";
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

const NEXT_STATUS: Record<TailorJobStatus, { next: TailorJobStatus; fr: string; en: string } | null> = {
  todo: { next: "doing", fr: "Commencer", en: "Start" },
  doing: { next: "ready", fr: "Marquer prêt", en: "Mark ready" },
  ready: { next: "delivered", fr: "Marquer livré", en: "Mark delivered" },
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
      setError(e instanceof Error ? e.message : tr("Chargement impossible.", "Could not load."));
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
    description.trim() && description.trim().length < 3 ? tr("Quelques mots.", "A few words.") : null;
  const today = todayISO();
  const dateErr = dueDate && dueDate < today ? tr("Date passée.", "Date in the past.") : null;
  const priceErr = amountError(price);
  const depositErr =
    amountError(deposit) ??
    (price && deposit && !priceErr && Number(deposit) > Number(price) ? tr("Avance supérieure au prix.", "Advance above the price.") : null);
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
      setError(err instanceof Error ? err.message : tr("Création impossible.", "Could not create."));
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
      setError(e instanceof Error ? e.message : tr("Mise à jour impossible.", "Could not update."));
    }
  }

  async function remove(job: TailorJob) {
    if (!window.confirm(tr(`Supprimer « ${job.description} » ?`, `Delete “${job.description}”?`))) return;
    try {
      await TailorApi.deleteJob(job.id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : tr("Suppression impossible.", "Could not delete."));
    }
  }

  const priceNum = Number(price);
  const depositNum = Number(deposit);
  const reste =
    price && deposit && !priceErr && !depositErr && isFinite(priceNum) && isFinite(depositNum) ? priceNum - depositNum : null;

  return (
    <div className="tPage">
      <PageHeader
        title={tr("Travaux", "Jobs")}
        action={
          <Button variant="secondary" onClick={() => setShowForm((s) => !s)}>
            {showForm ? tr("Fermer", "Close") : tr("+ Nouveau", "+ New")}
          </Button>
        }
      />
      <ErrorBanner message={error} />

      {showForm && (
        <form onSubmit={create} className="card" noValidate>
          <label className="field">
            <span className="fieldLabel">{tr("Client", "Client")}</span>
            <select
              className="input"
              value={clientId}
              onChange={(e) => {
                setClientId(e.target.value);
                setClientName(clients.find((c) => c.id === e.target.value)?.name ?? "");
              }}
            >
              <option value="">{tr("Nouveau client", "New client")}</option>
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
                <span className="fieldLabel">{tr("Nom du client", "Client name")}</span>
                <Input
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  autoComplete="name"
                  maxLength={120}
                  aria-invalid={nameErr ? true : undefined}
                />
                {nameErr && <span className="fieldError">{nameErr}</span>}
              </label>
              <PhoneField label={tr("Téléphone du client", "Client phone")} value={clientPhone} onChange={setClientPhone} error={phoneErr} />
            </>
          )}
          <label className="field">
            <span className="fieldLabel">{tr("Vêtement", "Garment")}</span>
            <Textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={tr("Ex. robe en wax, manches longues", "E.g. wax dress, long sleeves")}
              maxLength={2000}
              aria-invalid={descriptionErr ? true : undefined}
            />
            {descriptionErr && <span className="fieldError">{descriptionErr}</span>}
          </label>
          <label className="field">
            <span className="fieldLabel">{tr("Livraison", "Due date")}</span>
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
              <span className="fieldLabel">{tr("Prix (FCFA)", "Price (FCFA)")}</span>
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
              <span className="fieldLabel">{tr("Avance (FCFA)", "Advance (FCFA)")}</span>
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
            <p className="muted">{tr("Reste", "Balance")} : <strong>{formatFcfa(reste)}</strong></p>
          )}
          <Button type="submit" block disabled={!canCreate}>
            {busy ? tr("Création…", "Creating…") : tr("Ajouter le travail", "Add job")}
          </Button>
        </form>
      )}

      {/* Menu deroulant, comme le catalogue : la place reste la meme quel que
          soit le nombre de filtres. */}
      <label className={`filterSelect ${filter !== "all" ? "filterSelectOn" : ""}`}>
        <span>{tr("Afficher", "Show")}</span>
        <Select value={filter} onChange={(e) => setFilter(e.target.value as Filter)}>
          <option value="all">{tr("Tous", "All")}</option>
          <optgroup label={tr("Échéance", "Due")}>
            <option value="week">{tr("Cette semaine", "This week")}</option>
            <option value="late">{tr("En retard", "Late")}</option>
          </optgroup>
          <optgroup label={tr("Statut", "Status")}>
            <option value="todo">{tr("À faire", "To do")}</option>
            <option value="doing">{tr("En cours", "In progress")}</option>
            <option value="ready">{tr("Prêts", "Ready")}</option>
            <option value="delivered">{tr("Livrés", "Delivered")}</option>
          </optgroup>
        </Select>
      </label>

      {jobs === null ? (
        <Spinner />
      ) : jobs.length === 0 ? (
        <EmptyState icon={<IconOrders size={30} strokeWidth={1.6} />} title={tr("Aucun travail", "No jobs")} />
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
                    <strong>{job.client_name || tr("Client retiré", "Removed client")}</strong>
                    <br />
                    <span className="tRowSub">{job.description}</span>
                  </span>
                  <JobBadge status={job.status} />
                </div>
                <p className="tRowSub" style={{ margin: "8px 0" }}>
                  {tr("Échéance", "Due")} : {job.due_date ? `${formatDateFR(job.due_date)} (${dueLabel(job.due_date)})` : "—"}
                  {job.price != null && <> · {tr("Prix", "Price")} : {formatFcfa(job.price)}</>}
                  {job.deposit != null && <> · {tr("Avance", "Advance")} : {formatFcfa(job.deposit)}</>}
                  {resteJob !== null && <> · {tr("Reste", "Balance")} : <strong>{formatFcfa(resteJob)}</strong></>}
                </p>
                <div className="tActionRow">
                  {step ? (
                    <Button variant="secondary" onClick={() => void advance(job)}>
                      {tr(step.fr, step.en)}
                    </Button>
                  ) : (
                    <span className="tRowSub">{tr("Terminé.", "Done.")}</span>
                  )}
                  {(job.price == null || (job.deposit ?? 0) < job.price) && (
                    <Link href={`/tailleur/finances?travail=${job.id}`} className="btn btnSecondary">
                      {tr("Encaisser", "Record payment")}
                    </Link>
                  )}
                  <Button variant="ghost" onClick={() => void remove(job)}>
                    {tr("Supprimer", "Delete")}
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
    <Suspense fallback={<Spinner />}>
      <TravauxInner />
    </Suspense>
  );
}
