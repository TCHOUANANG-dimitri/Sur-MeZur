"use client";

/**
 * Creation de compte.
 *
 * Le backend renvoie directement les jetons a l'inscription (pas de
 * verification par code avant d'entrer) : le parcours web se limite donc a un
 * seul ecran, contrairement au mobile qui insere une etape OTP. Le role est
 * fige a "client" — la version web ne propose pas de compte tailleur.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AuthApi } from "@/lib/api/endpoints";
import { setTokens, startAuthTimer } from "@/lib/api/client";
import { useAuth } from "@/components/AuthProvider";
import { Button, ErrorBanner, Field, Input } from "@/components/ui";

export default function Inscription() {
  const router = useRouter();
  const { refresh } = useAuth();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [consent, setConsent] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const tooShort = password.length > 0 && password.length < 8;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await AuthApi.register({
        role: "client",
        phone: phone.trim(),
        full_name: fullName.trim(),
        password,
        language: "fr",
        photo_consent: consent,
      });
      setTokens(res.access_token, res.refresh_token);
      startAuthTimer();
      await refresh();
      router.replace("/accueil");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Création du compte impossible.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="authPage">
      <div className="containerNarrow authCard">
        <h1>Créer un compte</h1>
        <p className="muted">Quelques secondes, puis vous pourrez prendre vos mesures.</p>

        <form onSubmit={submit} noValidate>
          <ErrorBanner message={error} />
          <Field label="Nom complet">
            <Input
              autoComplete="name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
          </Field>
          <Field label="Numéro de téléphone">
            <Input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="+237 6 XX XX XX XX"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
            />
          </Field>
          <Field
            label="Mot de passe"
            hint={tooShort ? "Au moins 8 caractères." : "Au moins 8 caractères."}
          >
            <Input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </Field>

          <label className="consentRow">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            <span>
              J&apos;accepte que mes photos soient analysées pour calculer mes mesures. Elles ne
              servent qu&apos;à cela.
            </span>
          </label>

          <Button
            type="submit"
            block
            disabled={busy || !fullName || !phone || password.length < 8}
          >
            {busy ? "Création…" : "Créer mon compte"}
          </Button>
        </form>

        <p className="muted authSwitch">
          Déjà inscrit ? <Link href="/connexion">Se connecter</Link>
        </p>
      </div>
    </main>
  );
}
