"use client";

/**
 * Changement de mot de passe (B2.4).
 *
 * Deux cas d'arrivee : mot de passe provisoire pose par l'equipe
 * (`must_change_password`, `RequireRole` y renvoie d'office) ou changement
 * volontaire depuis le profil. Apres validation, retour au parcours
 * (`?suite=…`) ou a l'espace du role.
 */

import { tr } from "@/lib/i18n";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { UsersApi } from "@/lib/api/endpoints";
import { useAuth } from "@/components/AuthProvider";
import { safeNext } from "@/lib/guest";
import { destinationFor } from "@/lib/home";
import { PasswordInput } from "@/components/fields";
import { Button, ErrorBanner, InfoBanner } from "@/components/ui";
import { passwordError, passwordHint } from "@/lib/password";

function ChangerMotDePasseInner() {
  const router = useRouter();
  const { user, loading, refresh } = useAuth();
  const next = safeNext(useSearchParams().get("suite"));
  const [current, setCurrent] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await UsersApi.changePassword(current, nextPassword);
      setDone(true);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : tr("Changement impossible.", "Could not change."));
    } finally {
      setBusy(false);
    }
  }

  if (!loading && !user) {
    router.replace("/connexion");
    return null;
  }

  const backTo = destinationFor(user?.role, next);

  return (
    <main className="authScreen">
      <form className="authForm" onSubmit={submit} noValidate>
        <h1 className="authTitle">{tr("Changer mon mot de passe", "Change password")}</h1>
        {user?.must_change_password && !done && (
          <p className="authSubtitle">
            {tr("Mot de passe provisoire : choisissez-en un nouveau.", "Temporary password: choose a new one.")}
          </p>
        )}
        <ErrorBanner message={error} />
        {done ? (
          <>
            <InfoBanner>
              <span>{tr("Mot de passe changé.", "Password changed.")}</span>
            </InfoBanner>
            <Button
              type="button"
              block
              onClick={() => router.replace(backTo)}
            >
              {tr("Continuer", "Continue")}
            </Button>
          </>
        ) : (
          <>
            <div className="field">
              <span className="fieldLabel">{tr("Mot de passe actuel", "Current password")}</span>
              <PasswordInput value={current} onChange={setCurrent} autoComplete="current-password" />
            </div>
            <div className="field">
              <span className="fieldLabel">{tr("Nouveau mot de passe", "New password")}</span>
              <PasswordInput value={nextPassword} onChange={setNextPassword} autoComplete="new-password" />
              <span className="fieldHint">
                {passwordHint(nextPassword)}
              </span>
            </div>
            <Button
              type="submit"
              block
              disabled={current.length === 0 || passwordError(nextPassword) !== null || busy}
            >
              {busy ? tr("Changement…", "Changing…") : tr("Changer", "Change")}
            </Button>
          </>
        )}
      </form>
    </main>
  );
}

export default function ChangerMotDePasse() {
  return (
    <Suspense fallback={null}>
      <ChangerMotDePasseInner />
    </Suspense>
  );
}
