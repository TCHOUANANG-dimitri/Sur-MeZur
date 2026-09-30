"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { OutboxList } from "@/components/OutboxList";
import { useOutbox } from "@/components/OutboxProvider";
import { SubjectCard } from "@/components/SubjectCard";
import { InfoBanner, PageHeader } from "@/components/ui";
import { IconCheck, IconChevronRight, IconNewSubject, IconOffline } from "@/components/icons";
import { CollecteApi, type Stats, type Subject } from "@/lib/api/collecte";
import { withRetry } from "@/lib/retry";

function StatTile({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div className="statTile">
      <span className="statValue">{value}</span>
      <span className="statLabel">{label}</span>
      {hint && <span className="statHint">{hint}</span>}
    </div>
  );
}

function Dashboard() {
  const { user, isAdmin } = useAuth();
  const { version } = useOutbox();
  const saved = useSearchParams().get("enregistre");
  const [stats, setStats] = useState<Stats | null>(null);
  const [recent, setRecent] = useState<Subject[]>([]);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([withRetry(() => CollecteApi.stats(), 2), withRetry(() => CollecteApi.list(), 2)])
      .then(([s, list]) => {
        if (cancelled) return;
        setStats(s);
        setRecent(list.slice(0, 5));
        setOffline(false);
      })
      .catch(() => !cancelled && setOffline(true));
    return () => {
      cancelled = true;
    };
  }, [version]);

  return (
    <>
      <PageHeader title={`Bonjour ${user?.full_name.split(" ")[0] ?? ""}`} />
      <div className="container section stack">
        {saved && (
          <InfoBanner>
            <IconCheck size={16} aria-hidden /> Fiche enregistrée sur l&apos;appareil. Elle part vers le serveur dès que le
            réseau le permet.
          </InfoBanner>
        )}

        <Link href="/sujets/nouveau" className="ctaCard">
          <span className="ctaIcon">
            <IconNewSubject size={24} aria-hidden />
          </span>
          <span className="ctaText">
            <strong>Nouvelle fiche</strong>
            <span>Mensurations au mètre ruban et photos d&apos;un volontaire</span>
          </span>
          <IconChevronRight size={20} aria-hidden />
        </Link>

        <OutboxList />

        {offline && !stats && (
          <div className="banner bannerWarn">
            <IconOffline size={18} aria-hidden />
            <span>Hors connexion : les statistiques s&apos;afficheront au retour du réseau. La saisie reste possible.</span>
          </div>
        )}

        {stats && (
          <section>
            <h2 className="sectionTitle">{isAdmin ? "Toute la campagne" : "Mes fiches"}</h2>
            <div className="statGrid">
              <StatTile label="Fiches" value={stats.total} hint={`${stats.today} aujourd'hui`} />
              <StatTile label="Complètes" value={stats.complete} hint="12 mesures + face + profil" />
              <StatTile label="Validées" value={stats.validated} hint={`${stats.pending} à relire`} />
              <StatTile label="Hommes / Femmes" value={`${stats.male} / ${stats.female}`} />
            </div>
            {stats.female < stats.male && (
              <p className="muted small">
                Le modèle manque surtout de données féminines (rapport §6ter) : privilégiez les volontaires femmes.
              </p>
            )}
          </section>
        )}

        {recent.length > 0 && (
          <section className="stack">
            <div className="rowBetween">
              <h2 className="sectionTitle">Dernières fiches</h2>
              <Link href="/sujets" className="linkMore">
                Tout voir
              </Link>
            </div>
            {recent.map((s) => (
              <SubjectCard key={s.id} subject={s} showCollector={isAdmin} />
            ))}
          </section>
        )}
      </div>
    </>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Dashboard />
    </Suspense>
  );
}
