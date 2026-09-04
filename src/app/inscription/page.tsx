"use client";

/**
 * Creation de compte, calquee sur l'ecran mobile.
 *
 * Le backend renvoie directement les jetons a l'inscription : le parcours web
 * tient donc en un seul ecran, la ou le mobile insere une etape par code. Le
 * role est fige a "client" — la version web ne propose pas de compte tailleur.
 */

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AuthApi } from "@/lib/api/endpoints";
import { setTokens, startAuthTimer } from "@/lib/api/client";
import { useAuth } from "@/components/AuthProvider";
import { PasswordInput, PhoneField } from "@/components/fields";
import { Button, ErrorBanner } from "@/components/ui";
import { COUNTRIES } from "@/lib/countries";

export default function Inscription() {
  const router = useRouter();
  const { refresh } = useAuth();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState(COUNTRIES[0].dial);
  const [password, setPassword] = useState("");
  const [consent, setConsent] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const localDigits = phone.replace(/^\+\d+/, "");
  const canSubmit =
    fullName.trim().length >= 2 && localDigits.length >= 6 && password.length >= 8 && !busy;

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
    <main className="authScreen">
      <form className="authForm" onSubmit={submit} noValidate>
        <div className="authLogo">
          <Image
            src="/logo.png"
            alt="Sur-MeZur"
            width={420}
            height={630}
            priority
            sizes="(max-width: 480px) 55vw, 200px"
          />
        </div>

        <h1 className="authTitle">Créer un compte</h1>

        <ErrorBanner message={error} />

        <label className="field">
          <span className="fieldLabel">Nom complet</span>
          <input
            className="input"
            autoComplete="name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
        </label>

        <PhoneField label="Numéro de téléphone" value={phone} onChange={setPhone} />

        <div className="field">
          <span className="fieldLabel">Mot de passe</span>
          <PasswordInput
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
          />
          <span className="fieldHint">Au moins 8 caractères.</span>
        </div>

        <label className="consentRow">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>
            J&apos;accepte que mes photos soient analysées pour calculer mes mesures. Elles ne
            servent qu&apos;à cela.
          </span>
        </label>

        <Button type="submit" block disabled={!canSubmit}>
          {busy ? "Création…" : "Créer mon compte"}
        </Button>

        <div className="authLinks">
          <Link href="/connexion" className="authLink">
            J&apos;ai déjà un compte
          </Link>
        </div>
      </form>
    </main>
  );
}
