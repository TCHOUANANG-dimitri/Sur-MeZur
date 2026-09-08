"use client";

/**
 * Connexion — point d'entree du site (la racine y redirige).
 *
 * Calquee sur l'ecran mobile (mobile/app/login.tsx) : logo, titre, champ
 * telephone avec indicatif, mot de passe avec bascule d'affichage, bouton
 * plein, puis les deux liens secondaires.
 *
 * CONTRAINTE DE HAUTEUR : l'ecran doit tenir entierement dans la fenetre,
 * sans defilement, y compris sur un telephone de 640 px de haut. Le logo est
 * donc dimensionne en unites de hauteur de vue (`vh`) et non en pixels fixes,
 * et il s'efface completement sous 460 px de haut plutot que de repousser le
 * formulaire hors du cadre. Voir `.authLogo` dans auth.css.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Image from "next/image";
import { AuthApi } from "@/lib/api/endpoints";
import { setTokens, startAuthTimer } from "@/lib/api/client";
import { useAuth } from "@/components/AuthProvider";
import { PasswordInput, PhoneField } from "@/components/fields";
import { Button, ErrorBanner } from "@/components/ui";
import { COUNTRIES, splitPhone } from "@/lib/countries";

export default function Connexion() {
  const router = useRouter();
  const { refresh } = useAuth();
  const [phone, setPhone] = useState(COUNTRIES[0].dial);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Le numero local vient de `splitPhone`, qui coupe sur les indicatifs
  // CONNUS. Une expression reguliere du type /^\+\d+/ ne marche pas :
  // `\d+` est gourmand et avale le numero entier en plus de l'indicatif,
  // ce qui laissait le bouton grise quelle que soit la saisie.
  const localDigits = splitPhone(phone).local;
  const canSubmit = localDigits.length >= 6 && password.length > 0 && !busy;

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
    <main className="authScreen">
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
          <Link href="/inscription" className="authLink">
            Créer un compte
          </Link>
        </div>
      </form>
    </main>
  );
}
