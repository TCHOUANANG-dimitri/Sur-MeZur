"use client";

/**
 * Connexion — point d'entree du site.
 *
 * Calquee sur l'ecran mobile (mobile/app/login.tsx) : logo, titre, champ
 * telephone avec indicatif, mot de passe avec bascule d'affichage, bouton
 * plein, puis les deux liens secondaires.
 *
 * Cas particuliers geres (B2) :
 * - `mfa_required` (administrateur protege) : ecran « code à 6 chiffres »,
 *   echange via `AuthApi.mfa` ;
 * - `must_change_password` (mot de passe provisoire pose par l'equipe) :
 *   redirection vers `/changer-mot-de-passe` ;
 * - un tailleur arrive sur `/tailleur` apres connexion.
 *
 * CONTRAINTE DE HAUTEUR : l'ecran doit tenir entierement dans la fenetre,
 * sans defilement, y compris sur un telephone de 640 px de haut. Le logo est
 * donc dimensionne en unites de hauteur de vue (`vh`) et non en pixels fixes,
 * et il s'efface completement sous 460 px de haut plutot que de repousser le
 * formulaire hors du cadre. Voir `.authLogo` dans auth.css.
 */

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import Image from "next/image";
import { AuthApi } from "@/lib/api/endpoints";
import { setTokens, startAuthTimer } from "@/lib/api/client";
import { guestClaimToken, safeNext } from "@/lib/guest";
import { useAuth } from "@/components/AuthProvider";
import { PasswordInput, PhoneField } from "@/components/fields";
import { Button, ErrorBanner } from "@/components/ui";
import { COUNTRIES, splitPhone } from "@/lib/countries";

function destinationFor(role: string, next: string | null): string {
  if (next) return next;
  if (role === "tailor") return "/tailleur";
  if (role === "admin") return "/admin";
  return "/accueil";
}

function ConnexionInner() {
  const router = useRouter();
  const { refresh } = useAuth();
  const next = safeNext(useSearchParams().get("suite"));
  const [phone, setPhone] = useState(COUNTRIES[0].dial);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // Double authentification : le serveur a renvoye `mfa_token`, on demande
  // le code a 6 chiffres.
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState("");

  // Le numero local vient de `splitPhone`, qui coupe sur les indicatifs
  // CONNUS. Une expression reguliere du type /^\+\d+/ ne marche pas :
  // `\d+` est gourmand et avale le numero entier en plus de l'indicatif,
  // ce qui laissait le bouton grise quelle que soit la saisie.
  const localDigits = splitPhone(phone).local;
  const canSubmit = localDigits.length >= 6 && password.length > 0 && !busy;

  async function afterTokens(role: string, mustChange: boolean | undefined) {
    startAuthTimer();
    await refresh();
    if (mustChange) router.replace("/changer-mot-de-passe");
    else router.replace(destinationFor(role, next));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      // Quelqu'un qui avait deja un compte et vient de prendre ses mesures
      // sans etre connecte : le serveur les rattache a ce compte.
      const res = await AuthApi.login(phone.trim(), password, guestClaimToken());
      if (res.mfa_required) {
        if (!res.mfa_token) {
          setError("Vérification supplémentaire requise. Réessayez.");
        } else {
          setMfaToken(res.mfa_token);
        }
        return;
      }
      setTokens(res.access_token, res.refresh_token);
      await afterTokens(res.role, res.must_change_password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connexion impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function submitMfa(e: React.FormEvent) {
    e.preventDefault();
    if (!mfaToken) return;
    setError("");
    setBusy(true);
    try {
      const res = await AuthApi.mfa(mfaToken, mfaCode.trim());
      setTokens(res.access_token, res.refresh_token);
      await afterTokens(res.role, res.must_change_password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Code invalide ou expiré.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="authScreen">
      {mfaToken ? (
        <form className="authForm" onSubmit={submitMfa} noValidate>
          <h1 className="authTitle">Code de vérification</h1>
          <p className="authSubtitle">
            Votre compte est protégé : saisissez le code à 6 chiffres.
          </p>
          <ErrorBanner message={error} />
          <label className="field">
            <span className="fieldLabel">Code à 6 chiffres</span>
            <input
              className="input mfaCode"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={mfaCode}
              onChange={(e) => setMfaCode(e.target.value.replace(/[^0-9]/g, ""))}
            />
          </label>
          <Button type="submit" block disabled={mfaCode.length !== 6 || busy}>
            {busy ? "Vérification…" : "Vérifier"}
          </Button>
          <div className="authLinks">
            <button type="button" className="authLink" onClick={() => { setMfaToken(null); setMfaCode(""); }}>
              Retour
            </button>
          </div>
        </form>
      ) : (
        <form className="authForm" onSubmit={submit} noValidate>
          <div className="authLogo">
            <Image
              src="/logo.png"
              alt="Sur-MeZur"
              width={420}
              height={630}
              priority
              sizes="(max-width: 480px) 60vw, 220px"
            />
          </div>

          <h1 className="authTitle">Connexion</h1>

          <ErrorBanner message={error} />

          <PhoneField label="Numéro de téléphone" value={phone} onChange={setPhone} />

          <div className="field">
            <span className="fieldLabel">Mot de passe</span>
            <PasswordInput value={password} onChange={setPassword} />
          </div>

          <Button type="submit" block disabled={!canSubmit}>
            {busy ? "Connexion…" : "Se connecter"}
          </Button>

          <div className="authLinks">
            <Link href="/mot-de-passe-oublie" className="authLink">
              Mot de passe oublié ?
            </Link>
            <Link
              href={next ? `/inscription?suite=${encodeURIComponent(next)}` : "/inscription"}
              className="authLink"
            >
              Créer un compte
            </Link>
          </div>
        </form>
      )}
    </main>
  );
}

export default function Connexion() {
  // `useSearchParams` impose une frontiere Suspense en App Router.
  return (
    <Suspense fallback={null}>
      <ConnexionInner />
    </Suspense>
  );
}
