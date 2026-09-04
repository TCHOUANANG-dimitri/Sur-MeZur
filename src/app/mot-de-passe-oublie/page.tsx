"use client";

/**
 * Reinitialisation du mot de passe, en deux etapes sur un meme ecran.
 *
 * Aucun fournisseur SMS n'est branche : le backend renvoie le code dans sa
 * reponse (`dev_code`) et on l'affiche donc a l'ecran, exactement comme le
 * fait l'application mobile. C'est une facilite de developpement assumee, pas
 * un oubli — elle devra disparaitre le jour ou les SMS partiront reellement.
 */

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AuthApi } from "@/lib/api/endpoints";
import { setTokens, startAuthTimer } from "@/lib/api/client";
import { useAuth } from "@/components/AuthProvider";
import { PasswordInput, PhoneField } from "@/components/fields";
import { Button, ErrorBanner, InfoBanner } from "@/components/ui";
import { COUNTRIES, splitPhone } from "@/lib/countries";

export default function MotDePasseOublie() {
  const router = useRouter();
  const { refresh } = useAuth();
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState(COUNTRIES[0].dial);
  const [devCode, setDevCode] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Le numero local vient de `splitPhone`, qui coupe sur les indicatifs
  // CONNUS. Une expression reguliere du type /^\+\d+/ ne marche pas :
  // `\d+` est gourmand et avale le numero entier en plus de l'indicatif,
  // ce qui laissait le bouton grise quelle que soit la saisie.
  const localDigits = splitPhone(phone).local;

  async function requestCode(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await AuthApi.passwordResetRequest(phone.trim());
      setDevCode(res.dev_code ?? "");
      setStep("code");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Aucun compte avec ce numéro.");
    } finally {
      setBusy(false);
    }
  }

  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await AuthApi.passwordResetConfirm(phone.trim(), code.trim(), password);
      setTokens(res.access_token, res.refresh_token);
      startAuthTimer();
      await refresh();
      router.replace(res.role === "admin" ? "/admin" : "/accueil");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Code invalide ou expiré.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="authScreen">
      <form className="authForm" onSubmit={step === "phone" ? requestCode : confirm} noValidate>
        <div className="authLogo">
          <Image
            src="/logo.png"
            alt="Sur-MeZur"
            width={420}
            height={630}
            sizes="(max-width: 480px) 55vw, 200px"
          />
        </div>

        <h1 className="authTitle">Mot de passe oublié</h1>

        <ErrorBanner message={error} />

        {step === "phone" ? (
          <>
            <p className="authSubtitle">
              Indiquez le numéro de votre compte, nous vous enverrons un code.
            </p>
            <PhoneField label="Numéro de téléphone" value={phone} onChange={setPhone} />
            <Button type="submit" block disabled={localDigits.length < 6 || busy}>
              {busy ? "Envoi…" : "Recevoir un code"}
            </Button>
          </>
        ) : (
          <>
            {devCode && (
              <InfoBanner>
                <span>
                  Code de vérification : <strong>{devCode}</strong>
                </span>
              </InfoBanner>
            )}

            <label className="field">
              <span className="fieldLabel">Code reçu</span>
              <input
                className="input"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, ""))}
              />
            </label>

            <div className="field">
              <span className="fieldLabel">Nouveau mot de passe</span>
              <PasswordInput value={password} onChange={setPassword} autoComplete="new-password" />
              <span className="fieldHint">Au moins 8 caractères.</span>
            </div>

            <Button type="submit" block disabled={code.length < 4 || password.length < 8 || busy}>
              {busy ? "Validation…" : "Changer mon mot de passe"}
            </Button>
          </>
        )}

        <div className="authLinks">
          <Link href="/connexion" className="authLink">
            Retour à la connexion
          </Link>
        </div>
      </form>
    </main>
  );
}
