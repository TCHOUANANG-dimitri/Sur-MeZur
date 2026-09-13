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
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { AuthApi } from "@/lib/api/endpoints";
import { setTokens, startAuthTimer } from "@/lib/api/client";
import { guestClaimToken, safeNext } from "@/lib/guest";
import { useAuth } from "@/components/AuthProvider";
import { PasswordInput, PhoneField } from "@/components/fields";
import { Button, ErrorBanner } from "@/components/ui";
import { COUNTRIES, splitPhone } from "@/lib/countries";
import { PASSWORD_HINT, passwordError } from "@/lib/password";

function InscriptionInner() {
  const router = useRouter();
  const { refresh } = useAuth();
  // Retour prevu apres inscription, typiquement les mesures completes de
  // la personne qui vient de les prendre sans compte.
  const next = safeNext(useSearchParams().get("suite"));
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState(COUNTRIES[0].dial);
  const [password, setPassword] = useState("");
  const [consent, setConsent] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Le numero local vient de `splitPhone`, qui coupe sur les indicatifs
  // CONNUS. Une expression reguliere du type /^\+\d+/ ne marche pas :
  // `\d+` est gourmand et avale le numero entier en plus de l'indicatif,
  // ce qui laissait le bouton grise quelle que soit la saisie.
  // Meme logique assouplie que sur l'ecran de connexion : le bouton s'active
  // des que les champs sont remplis (nom, numero, mot de passe, consentement).
  // La validation fine du mot de passe reste au serveur au moment de
  // l'envoi ; on ne bloque pas la saisie sur une longueur exacte.
  const localDigits = splitPhone(phone).local;
  const canSubmit =
    fullName.trim().length >= 2 && localDigits.length >= 6 && password.length > 0 && consent && !busy;

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
        // Si des mesures ont ete prises sans compte, le serveur convertit ce
        // compte invite sur place : elles restent attachees a la personne.
        // Il ignore silencieusement tout jeton qui n'est pas celui d'un invite.
        guest_token: guestClaimToken(),
      });
      setTokens(res.access_token, res.refresh_token);
      startAuthTimer();
      await refresh();
      router.replace(next ?? "/accueil");
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
        {next && (
          <p className="authSubtitle">
            Vos mesures sont prêtes : un compte suffit pour les voir en entier.
          </p>
        )}

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
          <span className="fieldHint">{password.length > 0 ? (passwordError(password) ?? "Mot de passe valide.") : PASSWORD_HINT}</span>
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
          <Link
            href={next ? `/connexion?suite=${encodeURIComponent(next)}` : "/connexion"}
            className="authLink"
          >
            J&apos;ai déjà un compte
          </Link>
        </div>
      </form>
    </main>
  );
}

export default function Inscription() {
  // `useSearchParams` impose une frontiere Suspense en App Router.
  return (
    <Suspense fallback={null}>
      <InscriptionInner />
    </Suspense>
  );
}
