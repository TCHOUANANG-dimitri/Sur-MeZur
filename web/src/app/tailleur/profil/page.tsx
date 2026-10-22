"use client";

/**
 * Profil tailleur (B3.8), sur le modele du profil client : en-tete degrade
 * avec l'initiale et le nom de l'atelier, trois compteurs (clients, travaux
 * en cours, patrons), puis des sections de reglages en lignes. L'atelier
 * (nom, ville, quartier, presentation) et la langue se modifient dans une
 * carte qui s'ouvre sous l'en-tete. AUCUN ecran de verification : elle est
 * desactivee.
 */

import { useCallback, useEffect, useState } from "react";
import { TailorApi } from "@/lib/api/tailor";
import { UsersApi } from "@/lib/api/endpoints";
import type { TailorProfile } from "@/lib/api/types";
import { useAuth } from "@/components/AuthProvider";
import { Button, ErrorBanner, Input, Spinner, Textarea } from "@/components/ui";
import { ProfileStat, SettingsRow, SettingsSection } from "@/components/profile";
import {
  IconEdit,
  IconKey,
  IconLanguage,
  IconLocation,
  IconLogout,
  IconOrders,
  IconTailor,
  IconUsers,
} from "@/components/icons";
import { nameError } from "@/lib/validation";

const BIO_MAX = 500;
const LANGUES: Record<string, string> = { fr: "Français", en: "English" };

export default function ProfilTailleur() {
  const { user, refresh, logout } = useAuth();
  const [profile, setProfile] = useState<TailorProfile | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [counts, setCounts] = useState({ clients: 0, jobs: 0, patterns: 0 });
  const [editing, setEditing] = useState(false);
  const [shopName, setShopName] = useState("");
  const [city, setCity] = useState("");
  const [quartier, setQuartier] = useState("");
  const [bio, setBio] = useState("");
  const [language, setLanguage] = useState("fr");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const loadCounts = useCallback(async () => {
    const [dash, jobs] = await Promise.all([
      TailorApi.dashboard().catch(() => null),
      TailorApi.jobs().catch(() => []),
    ]);
    setCounts({
      clients: dash?.clients_count ?? 0,
      jobs: jobs.filter((j) => j.status !== "delivered").length,
      patterns: dash?.patterns_count ?? 0,
    });
  }, []);

  useEffect(() => {
    TailorApi.profile()
      .then(setProfile)
      .catch(() => setProfile(null))
      .finally(() => setLoaded(true));
    void loadCounts();
  }, [loadCounts]);

  function startEdit() {
    setShopName(profile?.shop_name ?? "");
    setCity(profile?.city ?? "");
    setQuartier(profile?.quartier ?? "");
    setBio(profile?.bio ?? "");
    setLanguage(user?.language ?? "fr");
    setNotice("");
    setEditing(true);
  }

  // Controles de saisie : nom d'atelier obligatoire, longueurs bornees.
  const shopErr = nameError(shopName, "Le nom de l'atelier");
  const cityErr = city.trim().length > 80 ? "80 caractères au plus." : null;
  const quartierErr = quartier.trim().length > 80 ? "80 caractères au plus." : null;
  const canSave = !shopErr && !cityErr && !quartierErr && bio.length <= BIO_MAX && !busy;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    setError("");
    setBusy(true);
    try {
      setProfile(
        await TailorApi.updateProfile({
          shop_name: shopName.trim(),
          city: city.trim(),
          quartier: quartier.trim(),
          bio: bio.trim(),
        })
      );
      if (language !== user?.language) {
        await UsersApi.patchMe({ language: language as "fr" | "en" });
        await refresh();
      }
      setEditing(false);
      setNotice("Profil enregistré.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Enregistrement impossible.");
    } finally {
      setBusy(false);
    }
  }

  if (!loaded || !user) return <Spinner label="Chargement…" />;

  const atelier = profile?.shop_name?.trim() || user.full_name || "Mon atelier";
  const lieu = [profile?.city, profile?.quartier].filter((x) => x && x.trim()).join(", ");

  return (
    <div className="profilePage">
      <header className="profileHero">
        <div className="profileAvatar" aria-hidden>
          {atelier.charAt(0).toUpperCase()}
        </div>
        <h1 className="profileName">{atelier}</h1>
        <p className="profileSub">{lieu ? `Atelier de couture · ${lieu}` : "Atelier de couture"}</p>
        <p className="profileSub">
          {user.full_name} · {user.phone}
        </p>
        {!editing && (
          <button className="profileEditChip" onClick={startEdit}>
            Modifier mon atelier
          </button>
        )}
      </header>

      <div className="container profileBody">
        <ErrorBanner message={error} />
        {notice && <div className="banner bannerInfo">{notice}</div>}

        {editing && (
          <form className="card profileEditCard" onSubmit={save} noValidate>
            <label className="field">
              <span className="fieldLabel">Nom de l&apos;atelier</span>
              <Input
                value={shopName}
                onChange={(e) => setShopName(e.target.value)}
                autoComplete="organization"
                maxLength={120}
                aria-invalid={shopErr ? true : undefined}
              />
              {shopErr && <span className="fieldError">{shopErr}</span>}
            </label>
            <div className="fieldRow">
              <label className="field">
                <span className="fieldLabel">Ville</span>
                <Input
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  autoComplete="address-level2"
                  maxLength={80}
                  aria-invalid={cityErr ? true : undefined}
                />
                {cityErr && <span className="fieldError">{cityErr}</span>}
              </label>
              <label className="field">
                <span className="fieldLabel">Quartier</span>
                <Input
                  value={quartier}
                  onChange={(e) => setQuartier(e.target.value)}
                  maxLength={80}
                  aria-invalid={quartierErr ? true : undefined}
                />
                {quartierErr && <span className="fieldError">{quartierErr}</span>}
              </label>
            </div>
            <label className="field">
              <span className="fieldLabel">Présentation</span>
              <Textarea
                rows={3}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Ex. Atelier de couture homme et femme à Douala, spécialités : boubous, robes de soirée."
                maxLength={BIO_MAX}
              />
              <span className="fieldHint">
                {bio.length} / {BIO_MAX} caractères
              </span>
            </label>
            <label className="field">
              <span className="fieldLabel">Langue</span>
              <select className="input" value={language} onChange={(e) => setLanguage(e.target.value)}>
                <option value="fr">Français</option>
                <option value="en">English</option>
              </select>
            </label>
            <div className="profileEditActions">
              <Button type="submit" disabled={!canSave}>
                {busy ? "Enregistrement…" : "Enregistrer"}
              </Button>
              <Button variant="secondary" onClick={() => setEditing(false)}>
                Annuler
              </Button>
            </div>
          </form>
        )}

        <div className="profileStats">
          <ProfileStat value={counts.clients} label="Clients" Icon={IconUsers} />
          <ProfileStat value={counts.jobs} label="Travaux en cours" Icon={IconOrders} />
          <ProfileStat value={counts.patterns} label="Patrons" Icon={IconTailor} />
        </div>

        <SettingsSection title="Mon atelier">
          <SettingsRow
            Icon={IconEdit}
            label="Présentation"
            hint={profile?.bio?.trim() || "Aucune présentation : quelques mots rassurent vos clients."}
            onClick={startEdit}
          />
          <SettingsRow Icon={IconLocation} label="Adresse" value={lieu || "À compléter"} onClick={startEdit} />
          <SettingsRow
            Icon={IconLanguage}
            label="Langue"
            value={LANGUES[user.language ?? "fr"] ?? "Français"}
            onClick={startEdit}
            last
          />
        </SettingsSection>

        <SettingsSection title="Mon activité">
          <SettingsRow
            href="/tailleur/clients"
            Icon={IconUsers}
            label="Carnet de clients"
            value={counts.clients > 0 ? String(counts.clients) : undefined}
          />
          <SettingsRow
            href="/tailleur/travaux"
            Icon={IconOrders}
            label="Travaux"
            value={counts.jobs > 0 ? `${counts.jobs} en cours` : undefined}
          />
          <SettingsRow
            href="/tailleur/patrons"
            Icon={IconTailor}
            label="Patrons"
            value={counts.patterns > 0 ? String(counts.patterns) : undefined}
            last
          />
        </SettingsSection>

        <SettingsSection title="Compte">
          <SettingsRow href="/changer-mot-de-passe" Icon={IconKey} label="Changer mon mot de passe" />
          <SettingsRow Icon={IconLogout} label="Se déconnecter" danger onClick={logout} last />
        </SettingsSection>
      </div>
    </div>
  );
}
