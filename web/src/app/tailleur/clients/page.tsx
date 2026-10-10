"use client";

/**
 * Carnet de clients (B3.2) : recherche par nom ou telephone, ajout en
 * 3 champs (nom, telephone, sexe), acces a la fiche de chacun.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { TailorApi } from "@/lib/api/tailor";
import type { TailorClient } from "@/lib/api/tailor";
import { Button, EmptyState, ErrorBanner, Input, PageHeader, Spinner } from "@/components/ui";
import { PhoneField } from "@/components/fields";
import { IconSearch, IconUsers } from "@/components/icons";
import { COUNTRIES } from "@/lib/countries";

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
      setError(e instanceof Error ? e.message : "Chargement impossible.");
      setClients([]);
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => void load(query), 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
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
      setError(err instanceof Error ? err.message : "Ajout impossible.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="tPage">
      <PageHeader
        title="Clients"
        action={
          <Button variant="secondary" onClick={() => setShowForm((s) => !s)}>
            {showForm ? "Fermer" : "+ Ajouter"}
          </Button>
        }
      />
      <ErrorBanner message={error} />

      {showForm && (
        <form onSubmit={add} className="card" noValidate>
          <label className="field">
            <span className="fieldLabel">Nom</span>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          </label>
          <PhoneField label="Téléphone" value={phone} onChange={setPhone} />
          <label className="field">
            <span className="fieldLabel">Sexe</span>
            <select className="input" value={gender} onChange={(e) => setGender(e.target.value)}>
              <option value="female">Femme</option>
              <option value="male">Homme</option>
            </select>
          </label>
          <Button type="submit" block disabled={name.trim().length < 2 || busy}>
            {busy ? "Ajout…" : "Ajouter"}
          </Button>
        </form>
      )}

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
          icon={<IconUsers size={30} strokeWidth={1.6} />}
          title={query ? "Aucun client trouvé" : "Carnet vide"}
          body={query ? "Essayez un autre nom ou numéro." : "Ajoutez votre premier client : nom, téléphone, sexe."}
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
                    {c.measurements_count ? ` · ${c.measurements_count} mesure${c.measurements_count > 1 ? "s" : ""}` : ""}
                    {c.jobs_count ? ` · ${c.jobs_count} travail${c.jobs_count > 1 ? "x" : ""}` : ""}
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
