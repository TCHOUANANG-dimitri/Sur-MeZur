"use client";

import { useState } from "react";
import { UsersApi } from "@/lib/api/endpoints";
import { useAuth } from "@/components/AuthProvider";
import { Button, Card, ErrorBanner, Field, Input, PageHeader, Spinner } from "@/components/ui";

export default function Profil() {
  const { user, loading, refresh, logout } = useAuth();
  const [fullName, setFullName] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  if (loading || !user) return <Spinner label="Chargement&hellip;" />;

  const value = fullName ?? user.full_name;
  const dirty = value.trim() !== user.full_name && value.trim().length > 0;

  async function save() {
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      await UsersApi.patchMe({ full_name: value.trim() });
      await refresh();
      setFullName(null);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Enregistrement impossible.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader title="Profil" />
      <div className="containerNarrow section">
        <ErrorBanner message={error} />

        <Card>
          <Field label="Nom complet">
            <Input value={value} onChange={(e) => setFullName(e.target.value)} />
          </Field>
          <Field label="Numéro de téléphone" hint="Il sert d'identifiant et ne peut pas être modifié ici.">
            <Input value={user.phone} disabled />
          </Field>
          <Button disabled={!dirty || saving} onClick={save}>
            {saving ? "Enregistrement…" : "Enregistrer"}
          </Button>
          {saved && (
            <span className="fieldHint" style={{ color: "var(--success)", marginLeft: 10 }}>
              Enregistré.
            </span>
          )}
        </Card>

        <Card variant="flat" style={{ marginTop: 16 }}>
          <h3 style={{ marginBottom: 6 }}>Vos photos</h3>
          <p className="muted" style={{ margin: 0 }}>
            Les photos que vous envoyez servent uniquement à calculer vos mesures. Elles ne
            sont montrées à personne d&apos;autre.
          </p>
        </Card>

        <div className="actionBar">
          <Button variant="ghost" block onClick={logout}>
            Se déconnecter
          </Button>
        </div>
      </div>
    </>
  );
}
