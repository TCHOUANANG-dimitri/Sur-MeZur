"use client";

/**
 * Reinitialisation du mot de passe, en deux etapes sur un meme ecran.
 *
 * Aucun fournisseur SMS n'est branche : le backend renvoie le code dans sa
 * reponse (`dev_code`) et on l'affiche donc a l'ecran, exactement comme le
 * fait l'application mobile. C'est une facilite de developpement assumee, pas
 * un oubli — elle devra disparaitre le jour ou les SMS partiront reellement.
 */

import { tr } from "@/lib/i18n";
import { homeFor } from "@/lib/home";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AuthApi } from "@/lib/api/endpoints";
import { ApiError, setTokens, startAuthTimer } from "@/lib/api/client";
import { useAuth } from "@/components/AuthProvider";
import { PasswordInput, PhoneField } from "@/components/fields";
import { Button, ErrorBanner, InfoBanner } from "@/components/ui";
import { COUNTRIES, splitPhone } from "@/lib/countries";
import { passwordError, passwordHint } from "@/lib/password";
import { phoneError } from "@/lib/validation";

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
  // Reinitialisation par code desactivee par l'equipe (l'API repond 503) :
  // on oriente vers le support, qui communiquera un mot de passe provisoire.
  const [otpDisabled, setOtpDisabled] = useState(false);

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
      if (err instanceof ApiError && err.status === 503) {
        setOtpDisabled(true);
        setError("");
      } else {
        setError(err instanceof Error ? err.message : tr("Aucun compte avec ce numéro.", "No account with this number."));
      }
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
      router.replace(homeFor(res.role));
    } catch (err) {
      setError(err instanceof Error ? err.message : tr("Code invalide ou expiré.", "Invalid or expired code."));
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

        <h1 className="authTitle">{tr("Mot de passe oublié", "Forgot password")}</h1>

        <ErrorBanner message={error} />

        {otpDisabled ? (
          <>
            <InfoBanner>
              <span>{tr("Contactez le support : il vous donnera un mot de passe provisoire.", "Contact support: they'll give you a temporary password.")}</span>
            </InfoBanner>
            <Link href="/contact" style={{ display: "contents" }}>
              <Button block>{tr("Contacter le support", "Contact support")}</Button>
            </Link>
          </>
        ) : step === "phone" ? (
          <>
            <p className="authSubtitle">{tr("Nous vous enverrons un code.", "We'll send you a code.")}</p>
            <PhoneField
              label={tr("Numéro de téléphone", "Phone number")}
              value={phone}
              onChange={setPhone}
              error={localDigits ? phoneError(phone) : null}
            />
            <Button type="submit" block disabled={phoneError(phone) !== null || busy}>
              {busy ? tr("Envoi…", "Sending…") : tr("Recevoir un code", "Get a code")}
            </Button>
          </>
        ) : (
          <>
            {devCode && (
              <InfoBanner>
                <span>
                  {tr("Code", "Code")} : <strong>{devCode}</strong>
                </span>
              </InfoBanner>
            )}

            <label className="field">
              <span className="fieldLabel">{tr("Code reçu", "Code received")}</span>
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
              <span className="fieldLabel">{tr("Nouveau mot de passe", "New password")}</span>
              <PasswordInput value={password} onChange={setPassword} autoComplete="new-password" />
              <span className="fieldHint">{passwordHint(password)}</span>
            </div>

            <Button type="submit" block disabled={code.length < 4 || passwordError(password) !== null || busy}>
              {busy ? tr("Validation…", "Saving…") : tr("Changer mon mot de passe", "Change password")}
            </Button>
          </>
        )}

        <div className="authLinks">
          <Link href="/connexion" className="authLink">
            {tr("Retour à la connexion", "Back to sign in")}
          </Link>
        </div>
      </form>
    </main>
  );
}
