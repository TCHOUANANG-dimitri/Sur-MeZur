"use client";

/**
 * Profil, calque sur l'ecran mobile (mobile/app/client/(tabs)/profile.tsx) :
 * en-tete degrade avec l'initiale, trois compteurs, puis des sections de
 * reglages en lignes.
 *
 * Une adaptation au perimetre web : la troisieme statistique du mobile
 * compte les commandes, absentes ici. Elle compte donc les modeles proposes
 * a la communaute, qui est la contribution equivalente sur le web.
 */

import { useCallback, useEffect, useState } from "react";
import { CatalogApi, MeasurementsApi, UsersApi } from "@/lib/api/endpoints";
import { useAuth } from "@/components/AuthProvider";
import { emailError, nameError } from "@/lib/validation";
import { Button, ErrorBanner, Spinner } from "@/components/ui";
import { ProfileStat as Stat, SettingsRow, SettingsSection } from "@/components/profile";
import {
  IconCatalog,
  IconLogout,
  IconMeasure,
  IconModels,
  IconOrders,
  IconProfile,
  IconShield,
  IconTailor,
} from "@/components/icons";
import { tr } from "@/lib/i18n";

export default function Profil() {
  const { user, loading, refresh, logout } = useAuth();
  const [counts, setCounts] = useState({ measures: 0, liked: 0, mine: 0 });
  const [editing, setEditing] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadCounts = useCallback(async () => {
    const [m, liked, all] = await Promise.all([
      MeasurementsApi.list().catch(() => []),
      CatalogApi.models({ liked_only: true }).catch(() => []),
      CatalogApi.models().catch(() => []),
    ]);
    setCounts({
      measures: m.length,
      liked: liked.length,
      mine: all.filter((x) => x.created_by && x.created_by === user?.id).length,
    });
  }, [user?.id]);

  useEffect(() => {
    if (user) void loadCounts();
  }, [user, loadCounts]);

  if (loading || !user) return <Spinner />;

  const nameErr = fullName.trim() ? nameError(fullName) : null;
  const emailErr = emailError(email);

  async function save() {
    setBusy(true);
    setError("");
    try {
      await UsersApi.patchMe({ full_name: fullName.trim(), email: email.trim() || null });
      await refresh();
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : tr("Enregistrement impossible.", "Could not save."));
    } finally {
      setBusy(false);
    }
  }

  async function purge() {
    if (!window.confirm(tr("Supprimer vos photos de mesure ? Vos mesures sont conservées.", "Delete your measurement photos? Your measurements are kept."))) return;
    try {
      await UsersApi.purgePhotos();
      setNotice(tr("Photos supprimées.", "Photos deleted."));
    } catch (e) {
      setError(e instanceof Error ? e.message : tr("Suppression impossible.", "Could not delete."));
    }
  }

  return (
    <div className="profilePage">
      <header className="profileHero">
        <div className="profileAvatar" aria-hidden>
          {user.full_name?.charAt(0).toUpperCase() ?? "?"}
        </div>
        <h1 className="profileName">{user.full_name}</h1>
        <p className="profileSub">{user.phone}</p>
        {user.email && <p className="profileSub">{user.email}</p>}
        {!editing && (
          <button
            className="profileEditChip"
            onClick={() => {
              setFullName(user.full_name ?? "");
              setEmail(user.email ?? "");
              setEditing(true);
            }}
          >
            {tr("Modifier mon profil", "Edit profile")}
          </button>
        )}
      </header>

      <div className="container profileBody">
        <ErrorBanner message={error} />
        {notice && <div className="banner bannerInfo">{notice}</div>}

        {editing && (
          <div className="card profileEditCard">
            <label className="field">
              <span className="fieldLabel">{tr("Nom complet", "Full name")}</span>
              <input
                className="input"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                maxLength={120}
                aria-invalid={nameErr ? true : undefined}
              />
              {nameErr && <span className="fieldError">{nameErr}</span>}
            </label>
            <label className="field">
              <span className="fieldLabel">{tr("E-mail", "E-mail")}</span>
              <input
                className="input"
                type="email"
                autoCapitalize="none"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                maxLength={160}
                aria-invalid={emailErr ? true : undefined}
              />
              {emailErr && <span className="fieldError">{emailErr}</span>}
            </label>
            <div className="profileEditActions">
              <Button onClick={save} disabled={busy || nameError(fullName) !== null || emailErr !== null}>
                {busy ? tr("Enregistrement…", "Saving…") : tr("Enregistrer", "Save")}
              </Button>
              <Button variant="secondary" onClick={() => setEditing(false)}>
                {tr("Annuler", "Cancel")}
              </Button>
            </div>
          </div>
        )}

        <div className="profileStats">
          <Stat value={counts.measures} label={tr("Mesures", "Measurements")} Icon={IconMeasure} />
          <Stat value={counts.liked} label={tr("Favoris", "Saved")} Icon={IconModels} />
          <Stat value={counts.mine} label={tr("Mes modèles", "My styles")} Icon={IconCatalog} />
        </div>

        <SettingsSection title={tr("Mon compte", "My account")}>
          <SettingsRow
            href="/mesures"
            Icon={IconMeasure}
            label={tr("Mes mesures", "My measurements")}
            value={counts.measures > 0 ? String(counts.measures) : undefined}
          />
          <SettingsRow
            href="/modeles?favoris=1"
            Icon={IconModels}
            label={tr("Modèles enregistrés", "Saved styles")}
            value={counts.liked > 0 ? String(counts.liked) : undefined}
          />
          <SettingsRow
            href="/modeles/proposer"
            Icon={IconCatalog}
            label={tr("Proposer un modèle", "Suggest a style")}
            last
          />
        </SettingsSection>

        <SettingsSection title={tr("Couture", "Tailoring")}>
          <SettingsRow href="/commandes" Icon={IconOrders} label={tr("Mes commandes", "My orders")} />
          <SettingsRow href="/tailleurs" Icon={IconTailor} label={tr("Trouver un tailleur", "Find a tailor")} last />
        </SettingsSection>

        <SettingsSection title={tr("Confidentialité", "Privacy")}>
          <SettingsRow
            Icon={IconShield}
            label={tr("Supprimer mes photos", "Delete my photos")}
            hint={tr("Vos mesures sont conservées.", "Your measurements are kept.")}
            onClick={purge}
            last
          />
        </SettingsSection>

        <SettingsSection>
          <SettingsRow Icon={IconLogout} label={tr("Se déconnecter", "Sign out")} danger onClick={logout} last />
        </SettingsSection>
      </div>
    </div>
  );
}
