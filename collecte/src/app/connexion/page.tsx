"use client";

/**
 * Connexion — meme ecran que la version web (web/src/app/connexion), sans
 * inscription : un compte d'agent est cree par un administrateur, depuis
 * l'onglet Equipe.
 */

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ALLOWED_ROLES, useAuth } from "@/components/AuthProvider";
import { PasswordInput, PhoneField } from "@/components/fields";
import { Button, ErrorBanner } from "@/components/ui";
import { setTokens, startAuthTimer } from "@/lib/api/client";
import { AuthApi } from "@/lib/api/collecte";
import { COUNTRIES, splitPhone } from "@/lib/countries";

export default function Connexion() {
  const router = useRouter();
  const { user, refresh } = useAuth();
  const [phone, setPhone] = useState(COUNTRIES[0].dial);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user && ALLOWED_ROLES.includes(user.role)) router.replace("/tableau-de-bord");
  }, [user, router]);

  const canSubmit = splitPhone(phone).local.length >= 6 && password.length > 0 && !busy;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await AuthApi.login(phone.trim(), password);
      if (!ALLOWED_ROLES.includes(res.role)) {
        setError("Ce compte n'a pas accès à la collecte. Demandez un compte agent à un administrateur.");
        return;
      }
      setTokens(res.access_token, res.refresh_token);
      startAuthTimer();
      await refresh();
      router.replace("/tableau-de-bord");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      setError(
        err instanceof TypeError
          ? "Pas de connexion au serveur. La première connexion demande du réseau."
          : msg === "Invalid phone or password"
            ? "Numéro ou mot de passe incorrect."
            : msg === "Account disabled"
              ? "Ce compte a été désactivé."
              : msg || "Connexion impossible."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="authScreen">
      <form className="authForm" onSubmit={submit} noValidate>
        <div className="authLogo">
          <Image src="/logo.png" alt="Sur-MeZur" width={420} height={630} priority sizes="220px" />
        </div>
        <h1 className="authTitle">Collecte de mesures</h1>
        <p className="authSubtitle">Espace réservé aux agents de terrain</p>

        <ErrorBanner message={error} />

        <PhoneField label="Numéro de téléphone" value={phone} onChange={setPhone} />
        <div className="field">
          <span className="fieldLabel">Mot de passe</span>
          <PasswordInput value={password} onChange={setPassword} />
        </div>

        <Button type="submit" block disabled={!canSubmit}>
          {busy ? "Connexion…" : "Se connecter"}
        </Button>
      </form>
    </main>
  );
}
