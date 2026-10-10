"use client";

/**
 * Changement de mot de passe (B2.4).
 *
 * Deux cas d'arrivee : mot de passe provisoire pose par l'equipe
 * (`must_change_password`, `RequireRole` y renvoie d'office) ou changement
 * volontaire depuis le profil. Apres validation, retour au parcours
 * (`?suite=…`) ou a l'espace du role.
 */

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { UsersApi } from "@/lib/api/endpoints";
import { useAuth } from "@/components/AuthProvider";
import { safeNext } from "@/lib/guest";
import { PasswordInput } from "@/components/fields";
import { Button, ErrorBanner, InfoBanner } from "@/components/ui";
import { PASSWORD_HINT, passwordError } from "@/lib/password";

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
      setError(err instanceof Error ? err.message : "Changement impossible.");
    } finally {
      setBusy(false);
    }
  }

  if (!loading && !user) {
    router.replace("/connexion");
    return null;
  }

  const backTo =
    next ?? (user?.role === "tailor" ? "/tailleur" : user?.role === "admin" ? "/admin" : "/accueil");

  return (
    <main className="authScreen">
      <form className="authForm" onSubmit={submit} noValidate>
        <h1 className="authTitle">Changer mon mot de passe</h1>
        {user?.must_change_password && !done && (
          <p className="authSubtitle">
            Un mot de passe provisoire a été posé sur votre compte : choisissez-en un nouveau pour continuer.
          </p>
        )}
        <ErrorBanner message={error} />
        {done ? (
          <>
            <InfoBanner>
              <span>Mot de passe changé. Vous pouvez reprendre votre parcours.</span>
            </InfoBanner>
            <Button
              type="button"
              block
              onClick={() => router.replace(backTo)}
            >
              Continuer
            </Button>
          </>
        ) : (
          <>
            <div className="field">
              <span className="fieldLabel">Mot de passe actuel</span>
              <PasswordInput value={current} onChange={setCurrent} autoComplete="current-password" />
            </div>
            <div className="field">
              <span className="fieldLabel">Nouveau mot de passe</span>
              <PasswordInput value={nextPassword} onChange={setNextPassword} autoComplete="new-password" />
              <span className="fieldHint">
                {nextPassword.length > 0 ? (passwordError(nextPassword) ?? "Mot de passe valide.") : PASSWORD_HINT}
              </span>
            </div>
            <Button
              type="submit"
              block
              disabled={current.length === 0 || passwordError(nextPassword) !== null || busy}
            >
              {busy ? "Changement…" : "Changer mon mot de passe"}
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
