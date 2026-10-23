"use client";

/**
 * Profil tailleur (B3.8), sur le modele du profil client : en-tete degrade
 * avec l'initiale et le nom de l'atelier, trois compteurs (clients, travaux
 * en cours, patrons), puis des sections de reglages en lignes. L'atelier
 * (nom, ville, quartier, presentation) et la langue se modifient dans une
 * carte qui s'ouvre sous l'en-tete. AUCUN ecran de verification : elle est
 * desactivee.
 */

import { tr } from "@/lib/i18n";
import { useCallback, useEffect, useState } from "react";
import { TailorApi } from "@/lib/api/tailor";
import type { TailorProfile } from "@/lib/api/types";
import { useAuth } from "@/components/AuthProvider";
import { Button, ErrorBanner, Input, Spinner, Textarea } from "@/components/ui";
import { ProfileStat, SettingsRow, SettingsSection } from "@/components/profile";
import {
  IconCall,
  IconEdit,
  IconKey,
  IconLocate,
  IconLocation,
  IconLogout,
  IconOrders,
  IconTailor,
  IconUsers,
  IconWallet,
} from "@/components/icons";
import { currentPosition, hasPosition } from "@/lib/tailors";
import { nameError } from "@/lib/validation";

const BIO_MAX = 500;

export default function ProfilTailleur() {
  const { user, logout } = useAuth();
  const [profile, setProfile] = useState<TailorProfile | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [counts, setCounts] = useState({ clients: 0, jobs: 0, patterns: 0 });
  const [editing, setEditing] = useState(false);
  const [shopName, setShopName] = useState("");
  const [city, setCity] = useState("");
  const [quartier, setQuartier] = useState("");
  const [bio, setBio] = useState("");
  const [landmark, setLandmark] = useState("");
  const [showPhone, setShowPhone] = useState(true);
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [positionNote, setPositionNote] = useState("");
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
    setLandmark(profile?.landmark ?? "");
    setShowPhone(profile?.show_phone !== false);
    setPosition(profile && hasPosition(profile) ? { lat: profile.lat as number, lng: profile.lng as number } : null);
    setPositionNote("");
    setNotice("");
    setEditing(true);
  }

  /** Position de l'atelier : a prendre SUR PLACE, le GPS du telephone donne
   *  le point ou l'on se trouve. */
  async function locate() {
    setLocating(true);
    setPositionNote("");
    try {
      const p = await currentPosition();
      setPosition({ lat: p.lat, lng: p.lng });
      setPositionNote(tr(`Position relevée (± ${Math.round(p.accuracy)} m). Enregistrez.`, `Location found (± ${Math.round(p.accuracy)} m). Save to keep it.`));
    } catch (e) {
      setPositionNote(e instanceof Error ? e.message : tr("Position indisponible.", "Location unavailable."));
    } finally {
      setLocating(false);
    }
  }

  // Controles de saisie : nom d'atelier obligatoire, longueurs bornees.
  const shopErr = nameError(shopName);
  const cityErr = city.trim().length > 80 ? tr("80 caractères au plus.", "80 characters at most.") : null;
  const quartierErr = quartier.trim().length > 80 ? tr("80 caractères au plus.", "80 characters at most.") : null;
  const landmarkErr = landmark.trim().length > 255 ? tr("255 caractères au plus.", "255 characters at most.") : null;
  const canSave = !shopErr && !cityErr && !quartierErr && !landmarkErr && bio.length <= BIO_MAX && !busy;

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
          landmark: landmark.trim(),
          show_phone: showPhone,
          lat: position?.lat ?? null,
          lng: position?.lng ?? null,
        })
      );
      setEditing(false);
      setNotice(tr("Profil enregistré.", "Profile saved."));
    } catch (err) {
      setError(err instanceof Error ? err.message : tr("Enregistrement impossible.", "Could not save."));
    } finally {
      setBusy(false);
    }
  }

  if (!loaded || !user) return <Spinner />;

  const atelier = profile?.shop_name?.trim() || user.full_name || tr("Mon atelier", "My workshop");
  const lieu = [profile?.city, profile?.quartier].filter((x) => x && x.trim()).join(", ");

  return (
    <div className="profilePage">
      <header className="profileHero">
        <div className="profileAvatar" aria-hidden>
          {atelier.charAt(0).toUpperCase()}
        </div>
        <h1 className="profileName">{atelier}</h1>
        <p className="profileSub">{lieu || tr("Atelier de couture", "Tailoring workshop")}</p>
        <p className="profileSub">
          {user.full_name} · {user.phone}
        </p>
        {!editing && (
          <button className="profileEditChip" onClick={startEdit}>
            {tr("Modifier mon atelier", "Edit workshop")}
          </button>
        )}
      </header>

      <div className="container profileBody">
        <ErrorBanner message={error} />
        {notice && <div className="banner bannerInfo">{notice}</div>}

        {editing && (
          <form className="card profileEditCard" onSubmit={save} noValidate>
            <label className="field">
              <span className="fieldLabel">{tr("Nom de l'atelier", "Workshop name")}</span>
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
                <span className="fieldLabel">{tr("Ville", "City")}</span>
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
                <span className="fieldLabel">{tr("Quartier", "Area")}</span>
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
              <span className="fieldLabel">{tr("Repère", "Landmark")}</span>
              <Input
                value={landmark}
                onChange={(e) => setLandmark(e.target.value)}
                placeholder={tr("Ex. face pharmacie du marché", "E.g. opposite the market pharmacy")}
                maxLength={255}
                aria-invalid={landmarkErr ? true : undefined}
              />
              {landmarkErr && <span className="fieldError">{landmarkErr}</span>}
            </label>
            <div className="field">
              <span className="fieldLabel">{tr("Position GPS (facultatif)", "GPS location (optional)")}</span>
              <span className="fieldHint">{tr("À relever depuis l'atelier.", "Take it at the workshop.")}</span>
              <div className="tActionRow" style={{ marginTop: 6 }}>
                <Button variant="secondary" onClick={() => void locate()} disabled={locating}>
                  <IconLocate size={18} aria-hidden /> {locating ? tr("Recherche…", "Locating…") : position ? tr("Relever à nouveau", "Locate again") : tr("Utiliser ma position", "Use my location")}
                </Button>
                {position && (
                  <Button variant="ghost" onClick={() => { setPosition(null); setPositionNote(tr("Position effacée. Enregistrez.", "Location cleared. Save to confirm.")); }}>
                    {tr("Effacer", "Clear")}
                  </Button>
                )}
              </div>
              {position && (
                <a
                  className="fieldHint"
                  href={`https://www.google.com/maps/search/?api=1&query=${position.lat},${position.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {tr("Voir sur la carte", "View on map")}
                </a>
              )}
              {positionNote && <span className="fieldHint" role="status">{positionNote}</span>}
            </div>
            <label className="field" style={{ flexDirection: "row", alignItems: "center", gap: 10, display: "flex" }}>
              <input
                type="checkbox"
                checked={showPhone}
                onChange={(e) => setShowPhone(e.target.checked)}
                style={{ width: 20, height: 20, accentColor: "var(--violet-primary)" }}
              />
              <span>{tr("Montrer mon numéro aux clients", "Show my number to clients")}</span>
            </label>
            <label className="field">
              <span className="fieldLabel">{tr("Présentation", "About")}</span>
              <Textarea
                rows={3}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder={tr("Ex. boubous, robes de soirée…", "E.g. boubous, evening dresses…")}
                maxLength={BIO_MAX}
              />
              <span className="fieldHint">
                {bio.length} / {BIO_MAX}
              </span>
            </label>
            <div className="profileEditActions">
              <Button type="submit" disabled={!canSave}>
                {busy ? tr("Enregistrement…", "Saving…") : tr("Enregistrer", "Save")}
              </Button>
              <Button variant="secondary" onClick={() => setEditing(false)}>
                {tr("Annuler", "Cancel")}
              </Button>
            </div>
          </form>
        )}

        <div className="profileStats">
          <ProfileStat value={counts.clients} label={tr("Clients", "Clients")} Icon={IconUsers} />
          <ProfileStat value={counts.jobs} label={tr("Travaux en cours", "Jobs in progress")} Icon={IconOrders} />
          <ProfileStat value={counts.patterns} label={tr("Patrons", "Patterns")} Icon={IconTailor} />
        </div>

        <SettingsSection title={tr("Mon atelier", "My workshop")}>
          <SettingsRow
            Icon={IconEdit}
            label={tr("Présentation", "About")}
            hint={profile?.bio?.trim() || tr("À compléter", "To fill in")}
            onClick={startEdit}
          />
          <SettingsRow
            Icon={IconLocation}
            label={tr("Adresse", "Address")}
            value={lieu || tr("À compléter", "To fill in")}
            hint={[profile?.landmark?.trim(), profile && hasPosition(profile) ? tr("GPS enregistré", "GPS saved") : null].filter(Boolean).join(" · ") || undefined}
            onClick={startEdit}
          />
          <SettingsRow
            Icon={IconCall}
            label={tr("Numéro visible", "Number visible")}
            value={profile?.show_phone === false ? tr("Masqué", "Hidden") : tr("Oui", "Yes")}
            onClick={startEdit}
            last
          />
        </SettingsSection>

        <SettingsSection title={tr("Mon activité", "My activity")}>
          <SettingsRow
            href="/tailleur/clients"
            Icon={IconUsers}
            label={tr("Clients", "Clients")}
            value={counts.clients > 0 ? String(counts.clients) : undefined}
          />
          <SettingsRow
            href="/tailleur/travaux"
            Icon={IconOrders}
            label={tr("Travaux", "Jobs")}
            value={counts.jobs > 0 ? String(counts.jobs) : undefined}
          />
          <SettingsRow
            href="/tailleur/patrons"
            Icon={IconTailor}
            label={tr("Patrons", "Patterns")}
            value={counts.patterns > 0 ? String(counts.patterns) : undefined}
          />
          <SettingsRow href="/tailleur/commandes" Icon={IconOrders} label={tr("Commandes Sur-MeZur", "Sur-MeZur orders")} />
          <SettingsRow href="/tailleur/finances" Icon={IconWallet} label={tr("Recettes", "Income")} last />
        </SettingsSection>

        <SettingsSection title={tr("Compte", "Account")}>
          <SettingsRow href="/changer-mot-de-passe" Icon={IconKey} label={tr("Changer mon mot de passe", "Change password")} />
          <SettingsRow Icon={IconLogout} label={tr("Se déconnecter", "Sign out")} danger onClick={logout} last />
        </SettingsSection>
      </div>
    </div>
  );
}
