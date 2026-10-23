"use client";

/**
 * Carnet de clients (B3.2) : recherche par nom ou telephone, ajout en
 * 3 champs (nom, telephone, sexe), acces a la fiche de chacun. Le numero est
 * obligatoire et verifie : sans lui, ni appel, ni WhatsApp, ni contact.
 */

import { tr } from "@/lib/i18n";
import Link from "next/link";
import { useEffect, useState } from "react";
import { TailorApi } from "@/lib/api/tailor";
import type { TailorClient } from "@/lib/api/tailor";
import { Button, EmptyState, ErrorBanner, Input, PageHeader, Spinner } from "@/components/ui";
import { PhoneField } from "@/components/fields";
import { IconSearch, IconUsers } from "@/components/icons";
import { COUNTRIES, splitPhone } from "@/lib/countries";
import { nameError, phoneError } from "@/lib/validation";

export default function Clients() {
  const [query, setQuery] = useState("");
  const [clients, setClients] = useState<TailorClient[] | null>(null);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState(COUNTRIES[0].dial);
  const [gender, setGender] = useState("female");
  const [busy, setBusy] = useState(false);

  async function load(q: string) {
    try {
      setClients(await TailorApi.clients(q || undefined));
    } catch (e) {
      setError(e instanceof Error ? e.message : tr("Chargement impossible.", "Could not load."));
      setClients([]);
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => void load(query), 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const nameErr = name.trim() ? nameError(name) : null;
  const phoneErr = splitPhone(phone).local ? phoneError(phone) : null;
  const canAdd = !nameError(name) && !phoneError(phone) && !busy;

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!canAdd) return;
    setError("");
    setBusy(true);
    try {
      const created = await TailorApi.createClient({ name: name.trim(), phone: phone.trim(), gender });
      setName("");
      setPhone(COUNTRIES[0].dial);
      setShowForm(false);
      await load(query);
      void created;
    } catch (err) {
      setError(err instanceof Error ? err.message : tr("Ajout impossible.", "Could not add."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="tPage">
      <PageHeader
        title={tr("Clients", "Clients")}
        action={
          <Button variant="secondary" onClick={() => setShowForm((s) => !s)}>
            {showForm ? tr("Fermer", "Close") : tr("+ Ajouter", "+ Add")}
          </Button>
        }
      />
      <ErrorBanner message={error} />

      {showForm && (
        <form onSubmit={add} className="card" noValidate>
          <label className="field">
            <span className="fieldLabel">{tr("Nom", "Name")}</span>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              maxLength={120}
              aria-invalid={nameErr ? true : undefined}
            />
            {nameErr && <span className="fieldError">{nameErr}</span>}
          </label>
          <PhoneField label={tr("Téléphone", "Phone")} value={phone} onChange={setPhone} error={phoneErr} />
          <label className="field">
            <span className="fieldLabel">{tr("Sexe", "Sex")}</span>
            <select className="input" value={gender} onChange={(e) => setGender(e.target.value)}>
              <option value="female">{tr("Femme", "Female")}</option>
              <option value="male">{tr("Homme", "Male")}</option>
            </select>
          </label>
          <Button type="submit" block disabled={!canAdd}>
            {busy ? tr("Ajout…", "Adding…") : tr("Ajouter", "Add")}
          </Button>
        </form>
      )}

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
          icon={<IconUsers size={30} strokeWidth={1.6} />}
          title={query ? tr("Aucun client trouvé", "No client found") : tr("Aucun client", "No clients yet")}
        />
      ) : (
        <ul className="tList">
          {clients.map((c) => (
            <li key={c.id}>
              <Link href={`/tailleur/clients/${c.id}`} className="tRow">
                <span className="tAvatar" aria-hidden>
                  {c.name.trim().charAt(0).toUpperCase() || <IconSearch size={18} />}
                </span>
                <span className="tRowMain">
                  <span className="tRowTitle">{c.name}</span>
                  <br />
                  <span className="tRowSub">
                    {c.phone}
                    {c.measurements_count ? ` · ${c.measurements_count} ${tr("mesure(s)", "measurement(s)")}` : ""}
                    {c.jobs_count ? ` · ${c.jobs_count} ${tr("travail(x)", "job(s)")}` : ""}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
