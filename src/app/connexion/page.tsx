"use client";

// Page de connexion — point d'entree unique du site (la racine y redirige).
// Fidele a l'ecran de connexion mobile : logo en tete, compte telephonique et
// mot de passe, puis bascule selon le role apres authentification.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AuthApi } from "@/lib/api/endpoints";
import { setTokens, startAuthTimer } from "@/lib/api/client";
import { useAuth } from "@/components/AuthProvider";
import { Button, ErrorBanner, Field, Input } from "@/components/ui";

export default function Connexion() {
  const router = useRouter();
  const { refresh } = useAuth();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await AuthApi.login(phone.trim(), password);
      setTokens(res.access_token, res.refresh_token);
      startAuthTimer();
      await refresh();
      router.replace(res.role === "admin" ? "/admin" : "/accueil");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connexion impossible.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="authPage">
      <div className="containerNarrow authCard">
        <div className="authLogo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-transparent.png" alt="Sur-MeZur" />
        </div>

        <h1>Se connecter</h1>
        <p className="muted">Retrouvez vos mesures et vos modèles enregistrés.</p>

        <form onSubmit={submit} noValidate>
          <ErrorBanner message={error} />
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
          <Field label="Mot de passe">
            <Input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </Field>
          <Button type="submit" block disabled={busy || !phone || !password}>
            {busy ? "Connexion…" : "Se connecter"}
          </Button>
        </form>

        <p className="muted authSwitch">
          Pas encore de compte ? <Link href="/inscription">Créer un compte</Link>
        </p>
      </div>
    </main>
  );
}
