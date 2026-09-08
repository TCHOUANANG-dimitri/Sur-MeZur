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

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CatalogApi, MeasurementsApi, UsersApi } from "@/lib/api/endpoints";
import { useAuth } from "@/components/AuthProvider";
import { Button, ErrorBanner, Spinner } from "@/components/ui";
import {
  IconCatalog,
  IconChevronRight,
  IconLogout,
  IconMeasure,
  IconModels,
  IconProfile,
  IconShield,
} from "@/components/icons";

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

  if (loading || !user) return <Spinner label="Chargement…" />;

  async function save() {
    setBusy(true);
    setError("");
    try {
      await UsersApi.patchMe({ full_name: fullName.trim(), email: email.trim() || null });
      await refresh();
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Enregistrement impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function purge() {
    if (!window.confirm("Supprimer définitivement les photos utilisées pour vos mesures ? Vos mensurations, elles, sont conservées.")) return;
    try {
      await UsersApi.purgePhotos();
      setNotice("Vos photos ont été supprimées.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Suppression impossible.");
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
            Modifier mon profil
          </button>
        )}
      </header>

      <div className="container profileBody">
        <ErrorBanner message={error} />
        {notice && <div className="banner bannerInfo">{notice}</div>}

        {editing && (
          <div className="card profileEditCard">
            <label className="field">
              <span className="fieldLabel">Nom complet</span>
              <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </label>
            <label className="field">
              <span className="fieldLabel">Adresse e-mail</span>
              <input
                className="input"
                type="email"
                autoCapitalize="none"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <div className="profileEditActions">
              <Button onClick={save} disabled={busy || fullName.trim().length < 2}>
                {busy ? "Enregistrement…" : "Enregistrer"}
              </Button>
              <Button variant="secondary" onClick={() => setEditing(false)}>
                Annuler
              </Button>
            </div>
          </div>
        )}

        <div className="profileStats">
          <Stat value={counts.measures} label="Mesures" Icon={IconMeasure} />
          <Stat value={counts.liked} label="Favoris" Icon={IconModels} />
          <Stat value={counts.mine} label="Mes modèles" Icon={IconCatalog} />
        </div>

        <SettingsSection title="Mon compte">
          <SettingsRow
            href="/mesures"
            Icon={IconMeasure}
            label="Mes mesures"
            value={counts.measures > 0 ? String(counts.measures) : undefined}
          />
          <SettingsRow
            href="/modeles?favoris=1"
            Icon={IconModels}
            label="Modèles enregistrés"
            value={counts.liked > 0 ? String(counts.liked) : undefined}
          />
          <SettingsRow
            href="/modeles/proposer"
            Icon={IconCatalog}
            label="Proposer un modèle"
            last
          />
        </SettingsSection>

        <SettingsSection title="Confidentialité">
          <SettingsRow
            Icon={IconShield}
            label="Supprimer mes photos"
            hint="Vos mensurations sont conservées."
            onClick={purge}
            last
          />
        </SettingsSection>

        <SettingsSection>
          <SettingsRow Icon={IconLogout} label="Se déconnecter" danger onClick={logout} last />
        </SettingsSection>
      </div>
    </div>
  );
}

function Stat({
  value,
  label,
  Icon,
}: {
  value: number;
  label: string;
  Icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
}) {
  return (
    <div className="profileStat">
      <span className="profileStatIcon" aria-hidden>
        <Icon size={18} strokeWidth={1.9} />
      </span>
      <span className="profileStatValue">{value}</span>
      <span className="profileStatLabel">{label}</span>
    </div>
  );
}

function SettingsSection({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section className="settingsSection">
      {title && <h2 className="settingsTitle">{title}</h2>}
      <div className="settingsCard">{children}</div>
    </section>
  );
}

function SettingsRow({
  Icon,
  label,
  value,
  hint,
  href,
  onClick,
  danger,
  last,
}: {
  Icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  label: string;
  value?: string;
  hint?: string;
  href?: string;
  onClick?: () => void;
  danger?: boolean;
  last?: boolean;
}) {
  const inner = (
    <>
      <span className={`settingsIcon ${danger ? "settingsIconDanger" : ""}`} aria-hidden>
        <Icon size={18} strokeWidth={1.9} />
      </span>
      <span className="settingsLabelWrap">
        <span className="settingsLabel">{label}</span>
        {hint && <span className="fieldHint">{hint}</span>}
      </span>
      {value && <span className="settingsValue">{value}</span>}
      {href && <IconChevronRight size={18} aria-hidden />}
    </>
  );

  const className = `settingsRow ${last ? "" : "settingsRowDivided"} ${danger ? "settingsRowDanger" : ""}`;

  if (href) {
    return (
      <Link href={href} className={className}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" className={className} onClick={onClick}>
      {inner}
    </button>
  );
}
