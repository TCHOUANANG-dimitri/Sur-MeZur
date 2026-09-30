"use client";

/**
 * Liste des fiches (lecture du CRUD). Un agent ne voit que les siennes, un
 * administrateur toute la campagne.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { OutboxList } from "@/components/OutboxList";
import { useOutbox } from "@/components/OutboxProvider";
import { REVIEW_LABELS, SubjectCard } from "@/components/SubjectCard";
import { Button, Chip, EmptyState, ErrorBanner, PageHeader, Spinner } from "@/components/ui";
import { IconNewSubject, IconRetry, IconSearch } from "@/components/icons";
import { CollecteApi, type ReviewStatus, type Subject } from "@/lib/api/collecte";
import { GENDER_LABELS, type Gender } from "@/lib/protocol";
import { friendlyError, withRetry } from "@/lib/retry";

export default function Fiches() {
  const { isAdmin } = useAuth();
  const { version } = useOutbox();
  const [subjects, setSubjects] = useState<Subject[] | null>(null);
  const [error, setError] = useState("");
  const [statut, setStatut] = useState<ReviewStatus | "">("");
  const [sexe, setSexe] = useState<Gender | "">("");
  const [incomplete, setIncomplete] = useState(false);
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [nonce, setNonce] = useState(0);

  // Recherche differee : pas une requete par lettre tapee.
  useEffect(() => {
    const t = setTimeout(() => setQuery(q.trim()), 350);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    let cancelled = false;
    setError("");
    withRetry(() => CollecteApi.list({ statut, sexe, q: query }), 2)
      .then((list) => !cancelled && setSubjects(list))
      .catch((e) => !cancelled && setError(friendlyError(e, "réessayez")));
    return () => {
      cancelled = true;
    };
  }, [statut, sexe, query, version, nonce]);

  const shown = (subjects ?? []).filter((s) => !incomplete || !s.complete);

  return (
    <>
      <PageHeader
        title="Fiches"
        action={
          <Link href="/sujets/nouveau" className="btn btnPrimary btnSmall">
            <IconNewSubject size={16} aria-hidden /> Nouvelle
          </Link>
        }
      />
      <div className="container section stack">
        <OutboxList />

        <div className="searchBox">
          <IconSearch size={18} aria-hidden />
          <input
            className="input searchInput"
            placeholder="Code (SMZ-0012), ville, lieu…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Rechercher une fiche"
          />
        </div>

        <div className="chipRow chipRowWrap">
          <Chip active={statut === ""} onClick={() => setStatut("")}>
            Toutes
          </Chip>
          {(Object.keys(REVIEW_LABELS) as ReviewStatus[]).map((s) => (
            <Chip key={s} active={statut === s} onClick={() => setStatut(statut === s ? "" : s)}>
              {REVIEW_LABELS[s]}
            </Chip>
          ))}
          {(Object.keys(GENDER_LABELS) as Gender[]).map((g) => (
            <Chip key={g} active={sexe === g} onClick={() => setSexe(sexe === g ? "" : g)}>
              {GENDER_LABELS[g]}
            </Chip>
          ))}
          <Chip active={incomplete} onClick={() => setIncomplete((v) => !v)}>
            Incomplètes
          </Chip>
        </div>

        {error && (
          <>
            <ErrorBanner message={error} />
            <Button variant="secondary" onClick={() => setNonce((n) => n + 1)}>
              <IconRetry size={16} aria-hidden /> Réessayer
            </Button>
          </>
        )}

        {!subjects && !error && <Spinner label="Chargement des fiches…" />}

        {subjects && shown.length === 0 && (
          <EmptyState
            title="Aucune fiche"
            body={query || statut || sexe || incomplete ? "Aucune fiche ne correspond à ces filtres." : "Commencez par saisir un premier volontaire."}
          />
        )}

        {shown.length > 0 && <p className="muted small">{shown.length} fiche(s)</p>}
        {shown.map((s) => (
          <SubjectCard key={s.id} subject={s} showCollector={isAdmin} />
        ))}
      </div>
    </>
  );
}
