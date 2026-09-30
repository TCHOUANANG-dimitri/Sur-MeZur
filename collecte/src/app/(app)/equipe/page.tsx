"use client";

/**
 * Agents de terrain (administrateur) : creation des comptes et desactivation.
 * Il n'y a pas d'inscription libre : un agent recoit ses identifiants d'un
 * administrateur.
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { PasswordInput, PhoneField } from "@/components/fields";
import { Badge, Button, ErrorBanner, Field, InfoBanner, Input, PageHeader, Spinner } from "@/components/ui";
import { IconCheck } from "@/components/icons";
import { CollecteApi, type Collector } from "@/lib/api/collecte";
import { COUNTRIES, splitPhone } from "@/lib/countries";
import { PASSWORD_HINT, passwordError } from "@/lib/password";
import { friendlyError } from "@/lib/retry";

export default function Equipe() {
  const { isAdmin, loading } = useAuth();
  const router = useRouter();
  const [team, setTeam] = useState<Collector[] | null>(null);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState(COUNTRIES[0].dial);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState("");

  useEffect(() => {
    if (!loading && !isAdmin) router.replace("/tableau-de-bord");
  }, [loading, isAdmin, router]);

  const load = useCallback(() => {
    CollecteApi.collectors()
      .then(setTeam)
      .catch((e) => setError(friendlyError(e, "réessayez")));
  }, []);

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin, load]);

  const pwdError = password ? passwordError(password) : null;
  const canCreate = name.trim().length >= 2 && splitPhone(phone).local.length >= 6 && !passwordError(password) && !busy;

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setCreated("");
    try {
      const c = await CollecteApi.createCollector({ full_name: name.trim(), phone: phone.trim(), password });
      setCreated(`Compte créé pour ${c.full_name}. Communiquez-lui son numéro et son mot de passe.`);
      setName("");
      setPhone(COUNTRIES[0].dial);
      setPassword("");
      load();
    } catch (err) {
      setError(friendlyError(err, "réessayez"));
    } finally {
      setBusy(false);
    }
  }

  async function toggle(c: Collector) {
    setError("");
    try {
      const updated = await CollecteApi.setCollectorActive(c.id, !c.is_active);
      setTeam((t) => t?.map((x) => (x.id === c.id ? updated : x)) ?? null);
    } catch (err) {
      setError(friendlyError(err, "réessayez"));
    }
  }

  if (!isAdmin) return null;

  return (
    <>
      <PageHeader title="Équipe" />
      <div className="containerNarrow section stack">
        <form className="card" onSubmit={create} noValidate>
          <h2 className="sectionTitle">Nouvel agent de collecte</h2>
          {created && (
            <InfoBanner>
              <IconCheck size={16} aria-hidden /> {created}
            </InfoBanner>
          )}
          <Field label="Nom complet">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <PhoneField label="Numéro de téléphone" value={phone} onChange={setPhone} />
          <div className="field">
            <span className="fieldLabel">Mot de passe provisoire</span>
            <PasswordInput value={password} onChange={setPassword} autoComplete="new-password" />
            <span className={pwdError ? "checkError" : "fieldHint"}>{pwdError ?? PASSWORD_HINT}</span>
          </div>
          <Button type="submit" block disabled={!canCreate}>
            {busy ? "Création…" : "Créer le compte"}
          </Button>
        </form>

        <ErrorBanner message={error} />

        <section className="stack">
          <h2 className="sectionTitle">Membres</h2>
          {!team && !error && <Spinner />}
          {team?.map((c) => (
            <div key={c.id} className="card memberRow">
              <div className="memberMain">
                <strong>{c.full_name}</strong>
                <span className="muted small">
                  {c.phone} · {c.subjects} fiche(s)
                </span>
              </div>
              <div className="memberSide">
                {c.role === "admin" ? (
                  <Badge tone="neutral">Admin</Badge>
                ) : (
                  <>
                    <Badge tone={c.is_active ? "success" : "error"}>{c.is_active ? "Actif" : "Désactivé"}</Badge>
                    <Button variant="ghost" className="btnSmall" onClick={() => void toggle(c)}>
                      {c.is_active ? "Désactiver" : "Réactiver"}
                    </Button>
                  </>
                )}
              </div>
            </div>
          ))}
        </section>
      </div>
    </>
  );
}
