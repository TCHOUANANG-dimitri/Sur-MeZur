"use client";

/**
 * Creation de compte, calquee sur l'ecran mobile.
 *
 * Le backend renvoie directement les jetons a l'inscription : le parcours web
 * tient donc en un seul ecran. Apres l'essai de mesure sans compte, la
 * personne choisit son role : « Je suis client » ou « Je suis tailleur »
 * (`?role=tailleur` preselectionne). Le compte invite est converti dans les
 * deux cas (`guest_token` ; l'Agent A gere la conversion en tailleur).
 *
 * Champs tailleur facultatifs : nom de l'atelier, ville (liste tiree de
 * `config.cities`), quartier. Rien n'est exige pour la verification, qui est
 * desactivee pour l'instant.
 *
 * « Comment nous avez-vous connu ? » (14.9) : liste deroulante facultative,
 * affichee seulement si `config.signup_source_question`, avec champ libre si
 * « Autre ». L'origine capturee a la premiere visite (utm, parrainage, chemin
 * d'arrivee) part dans `acquisition` (14.10).
 */

import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { AuthApi, PublicApi, type PublicConfig } from "@/lib/api/endpoints";
import { setTokens, startAuthTimer } from "@/lib/api/client";
import { guestClaimToken, safeNext } from "@/lib/guest";
import { readAcquisition } from "@/lib/acquisition";
import { useAuth } from "@/components/AuthProvider";
import { PasswordInput, PhoneField } from "@/components/fields";
import { Button, ErrorBanner } from "@/components/ui";
import { COUNTRIES, splitPhone } from "@/lib/countries";
import { PASSWORD_HINT, passwordError } from "@/lib/password";

type Role = "client" | "tailor";

function InscriptionInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { refresh } = useAuth();
  // Retour prevu apres inscription, typiquement les mesures completes de
  // la personne qui vient de les prendre sans compte.
  const next = safeNext(params.get("suite"));
  const roleParam = params.get("role");
  const [role, setRole] = useState<Role>(roleParam === "tailleur" || roleParam === "tailor" ? "tailor" : "client");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState(COUNTRIES[0].dial);
  const [password, setPassword] = useState("");
  const [shopName, setShopName] = useState("");
  const [city, setCity] = useState("");
  const [quartier, setQuartier] = useState("");
  const [consent, setConsent] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Configuration publique (villes, question d'origine) et canaux
  // d'acquisition. En cas d'echec, le formulaire reste utilisable.
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [channels, setChannels] = useState<{ code: string; name: string }[]>([]);
  const [source, setSource] = useState("");
  const [sourceOther, setSourceOther] = useState("");
  const [referral, setReferral] = useState("");

  useEffect(() => {
    PublicApi.config().then(setConfig).catch(() => {});
    PublicApi.channels().then(setChannels).catch(() => setChannels([]));
    const fromUrl = params.get("code")?.trim();
    if (fromUrl) {
      setReferral(fromUrl);
    } else {
      try {
        const raw = localStorage.getItem("smz_acquisition");
        if (raw) {
          const stored = JSON.parse(raw) as { referral_code?: string };
          if (stored?.referral_code) setReferral(stored.referral_code);
        }
      } catch {
        /* ignore */
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showSourceQuestion = config?.signup_source_question === true;
  const cities = config?.cities ?? [];
  const showOther = source === "other" || source === "autre";

  // Meme logique assouplie que sur l'ecran de connexion : le bouton s'active
  // des que les champs sont remplis. La validation fine du mot de passe reste
  // au serveur au moment de l'envoi.
  const localDigits = splitPhone(phone).local;
  const canSubmit =
    fullName.trim().length >= 2 && localDigits.length >= 6 && password.length > 0 && consent && !busy;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await AuthApi.register({
        role,
        phone: phone.trim(),
        full_name: fullName.trim(),
        password,
        language: "fr",
        photo_consent: consent,
        // Si des mesures ont ete prises sans compte, le serveur convertit ce
        // compte invite sur place : elles restent attachees a la personne.
        guest_token: guestClaimToken(),
        ...(role === "tailor"
          ? {
              ...(shopName.trim() ? { shop_name: shopName.trim() } : {}),
              ...(city ? { city } : {}),
              ...(quartier.trim() ? { quartier: quartier.trim() } : {}),
            }
          : {}),
        ...(showSourceQuestion && source
          ? {
              acquisition: {
                source,
                ...(showOther && sourceOther.trim() ? { source_other: sourceOther.trim() } : {}),
                ...readAcquisition(referral),
              },
            }
          : readAcquisition(referral)
            ? { acquisition: readAcquisition(referral) }
            : {}),
      });
      setTokens(res.access_token, res.refresh_token);
      startAuthTimer();
      await refresh();
      if (res.must_change_password) {
        router.replace("/changer-mot-de-passe");
      } else if (res.role === "tailor" || role === "tailor") {
        router.replace("/tailleur");
      } else {
        router.replace(next ?? "/accueil");
      }
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

        <div className="roleChoice" role="radiogroup" aria-label="Vous êtes">
          <button
            type="button"
            role="radio"
            aria-checked={role === "client"}
            className={`roleCard ${role === "client" ? "roleCardActive" : ""}`}
            onClick={() => setRole("client")}
          >
            <strong>Je suis client</strong>
            <span>Mes mesures, mes modèles, mon tailleur.</span>
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={role === "tailor"}
            className={`roleCard ${role === "tailor" ? "roleCardActive" : ""}`}
            onClick={() => setRole("tailor")}
          >
            <strong>Je suis tailleur</strong>
            <span>Mon carnet de clients et mes patrons.</span>
          </button>
        </div>

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

        {role === "tailor" && (
          <>
            <label className="field">
              <span className="fieldLabel">Nom de l&apos;atelier <span className="fieldOptional">(facultatif)</span></span>
              <input
                className="input"
                autoComplete="organization"
                value={shopName}
                onChange={(e) => setShopName(e.target.value)}
              />
            </label>
            <div className="fieldRow">
              <label className="field">
                <span className="fieldLabel">Ville <span className="fieldOptional">(facultatif)</span></span>
                {cities.length > 0 ? (
                  <select className="input" value={city} onChange={(e) => setCity(e.target.value)}>
                    <option value="">Choisir…</option>
                    {cities.map((c) => (
                      <option key={c.name} value={c.name}>{c.name}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    className="input"
                    autoComplete="address-level2"
                    placeholder="Ex. Douala"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                  />
                )}
              </label>
              <label className="field">
                <span className="fieldLabel">Quartier <span className="fieldOptional">(facultatif)</span></span>
                <input
                  className="input"
                  value={quartier}
                  onChange={(e) => setQuartier(e.target.value)}
                />
              </label>
            </div>
          </>
        )}

        <div className="field">
          <span className="fieldLabel">Mot de passe</span>
          <PasswordInput
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
          />
          <span className="fieldHint">{password.length > 0 ? (passwordError(password) ?? "Mot de passe valide.") : PASSWORD_HINT}</span>
        </div>

        {showSourceQuestion && (
          <label className="field">
            <span className="fieldLabel">Comment nous avez-vous connu ? <span className="fieldOptional">(facultatif)</span></span>
            <select className="input" value={source} onChange={(e) => setSource(e.target.value)}>
              <option value="">Choisir…</option>
              {channels.map((c) => (
                <option key={c.code} value={c.code}>{c.name}</option>
              ))}
              {channels.length === 0 && <option value="other">Autre</option>}
            </select>
          </label>
        )}
        {showSourceQuestion && showOther && (
          <label className="field">
            <span className="fieldLabel">Précisez</span>
            <input
              className="input"
              value={sourceOther}
              onChange={(e) => setSourceOther(e.target.value)}
              maxLength={120}
            />
          </label>
        )}

        <label className="field">
          <span className="fieldLabel">Code de parrainage ou promo <span className="fieldOptional">(facultatif)</span></span>
          <input
            className="input"
            autoComplete="off"
            value={referral}
            onChange={(e) => setReferral(e.target.value)}
            maxLength={64}
          />
        </label>

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
