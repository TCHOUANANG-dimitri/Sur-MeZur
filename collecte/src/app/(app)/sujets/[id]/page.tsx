"use client";

/**
 * Detail d'une fiche : lecture, suppression, et relecture par un
 * administrateur (valider / rejeter). La modification a sa propre page.
 */

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { AuthImage } from "@/components/PhotoSlot";
import { ReviewBadge } from "@/components/SubjectCard";
import { Badge, Button, ErrorBanner, InfoBanner, PageHeader, Spinner, Textarea } from "@/components/ui";
import { IconCheck, IconDelete, IconEdit, IconReject, IconWarning } from "@/components/icons";
import { CollecteApi, type ReviewStatus, type Subject } from "@/lib/api/collecte";
import {
  CLOTHING_LABELS,
  GENDER_LABELS,
  MEASURE_GROUPS,
  MEASURES,
  VIEW_KEYS,
  VIEWS,
  checkValue,
  fmtNum,
  formatCm,
} from "@/lib/protocol";
import { friendlyError, withRetry } from "@/lib/retry";

function Detail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const modified = useSearchParams().get("modifie");
  const { isAdmin } = useAuth();
  const [subject, setSubject] = useState<Subject | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [zoom, setZoom] = useState<string | null>(null);

  const load = useCallback(() => {
    setError("");
    withRetry(() => CollecteApi.get(id), 2)
      .then((s) => {
        setSubject(s);
        setNote(s.review_note ?? "");
      })
      .catch((e) => setError(friendlyError(e, "réessayez")));
  }, [id]);

  useEffect(load, [load]);

  async function review(status: ReviewStatus) {
    if (!subject) return;
    setBusy(true);
    setError("");
    try {
      setSubject(await CollecteApi.review(subject.id, status, note));
    } catch (e) {
      setError(friendlyError(e, "réessayez"));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!subject) return;
    setBusy(true);
    try {
      await CollecteApi.remove(subject.id);
      router.replace("/sujets");
    } catch (e) {
      setError(friendlyError(e, "réessayez"));
      setBusy(false);
    }
  }

  if (!subject) {
    return (
      <>
        <PageHeader title="Fiche" back />
        <div className="containerNarrow section">{error ? <ErrorBanner message={error} /> : <Spinner label="Chargement…" />}</div>
      </>
    );
  }

  const locked = subject.review_status === "validated" && !isAdmin;
  const zoomed = zoom ? subject.photos.find((p) => p.view === zoom) : null;

  return (
    <>
      <PageHeader
        title={subject.code}
        back
        action={
          !locked && (
            <Link href={`/sujets/${subject.id}/modifier`} className="btn btnSecondary btnSmall">
              <IconEdit size={16} aria-hidden /> Modifier
            </Link>
          )
        }
      />
      <div className="container section stack detailGrid">
        <div className="stack">
          {modified && (
            <InfoBanner>
              <IconCheck size={16} aria-hidden /> Modifications enregistrées.
            </InfoBanner>
          )}
          <ErrorBanner message={error} />

          <section className="card">
            <div className="subjectTop">
              <ReviewBadge status={subject.review_status} />
              {subject.complete ? <Badge tone="success">Complète</Badge> : <Badge tone="pending">Incomplète</Badge>}
            </div>
            <h2 className="detailTitle">
              {GENDER_LABELS[subject.gender]} · {fmtNum(subject.height_cm)} cm · {fmtNum(subject.weight_kg)} kg
              {subject.age ? ` · ${subject.age} ans` : ""}
            </h2>
            <dl className="infoList">
              {subject.clothing && (
                <div>
                  <dt>Tenue</dt>
                  <dd>{CLOTHING_LABELS[subject.clothing]}</dd>
                </div>
              )}
              {(subject.city || subject.place) && (
                <div>
                  <dt>Lieu</dt>
                  <dd>{[subject.city, subject.place].filter(Boolean).join(" — ")}</dd>
                </div>
              )}
              <div>
                <dt>Mesuré par</dt>
                <dd>
                  {subject.measured_by ?? "—"}
                  {subject.measured_at ? `, le ${new Date(subject.measured_at).toLocaleDateString("fr-FR")}` : ""}
                </dd>
              </div>
              {isAdmin && (
                <div>
                  <dt>Saisi par</dt>
                  <dd>{subject.collector_name ?? "—"}</dd>
                </div>
              )}
              <div>
                <dt>Consentement</dt>
                <dd>{subject.consent ? `Oui${subject.consent_name ? ` (${subject.consent_name})` : ""}` : "Non"}</dd>
              </div>
            </dl>
            {subject.notes && <p className="notes">{subject.notes}</p>}
            {subject.review_status === "rejected" && subject.review_note && (
              <div className="banner bannerError">
                <IconWarning size={18} aria-hidden />
                <span>Motif du rejet : {subject.review_note}</span>
              </div>
            )}
          </section>

          <section className="card">
            <h3 className="groupTitle">Mensurations</h3>
            {MEASURE_GROUPS.map((g) => (
              <div key={g.id} className="measureBlock">
                <p className="blockTitle">{g.title}</p>
                <dl className="recap">
                  {g.keys.map((k) => {
                    const v = subject.measurements[k];
                    const c = checkValue(v ?? null, MEASURES[k].usual, MEASURES[k].hard);
                    return (
                      <div key={k} className={`recapRow ${c.level === "warn" ? "recap-warn" : ""}`}>
                        <dt>{MEASURES[k].label}</dt>
                        <dd>{v !== undefined ? formatCm(v) : <span className="missing">manquante</span>}</dd>
                      </div>
                    );
                  })}
                </dl>
              </div>
            ))}
          </section>
        </div>

        <div className="stack">
          <section className="card">
            <h3 className="groupTitle">Photos</h3>
            <div className="photoGrid">
              {VIEW_KEYS.map((v) => {
                const p = subject.photos.find((x) => x.view === v);
                return (
                  <figure key={v} className="photoFigure">
                    {p ? (
                      <button className="photoZoomBtn" onClick={() => setZoom(v)} aria-label={`Agrandir la photo ${VIEWS[v].label}`}>
                        <AuthImage subjectId={subject.id} view={v} version={p.sha256} alt={VIEWS[v].label} className="photoFull" />
                      </button>
                    ) : (
                      <div className="photoPlaceholder photoFull">{VIEWS[v].required ? "Manquante" : "—"}</div>
                    )}
                    <figcaption>
                      {VIEWS[v].label}
                      {p?.width ? ` · ${p.width}×${p.height}` : ""}
                    </figcaption>
                  </figure>
                );
              })}
            </div>
          </section>

          {isAdmin && (
            <section className="card">
              <h3 className="groupTitle">Relecture</h3>
              <p className="muted small">
                Validez une fiche quand les photos respectent le protocole et que les mesures sont plausibles. Seules les
                fiches non rejetées sont exportées par défaut.
              </p>
              <Textarea
                rows={2}
                placeholder="Motif (obligatoire pour un rejet : photo floue, vêtement ample…)"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <div className="rowGap">
                <Button onClick={() => void review("validated")} disabled={busy || subject.review_status === "validated"}>
                  <IconCheck size={16} aria-hidden /> Valider
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => void review("rejected")}
                  disabled={busy || !note.trim() || subject.review_status === "rejected"}
                >
                  <IconReject size={16} aria-hidden /> Rejeter
                </Button>
                {subject.review_status !== "pending" && (
                  <Button variant="ghost" onClick={() => void review("pending")} disabled={busy}>
                    Remettre à relire
                  </Button>
                )}
              </div>
            </section>
          )}

          {!locked && (
            <section className="card dangerZone">
              {confirmDelete ? (
                <>
                  <p>
                    Supprimer définitivement <strong>{subject.code}</strong>, ses mesures et ses photos ? Cette action est
                    irréversible.
                  </p>
                  <div className="rowGap">
                    <Button variant="danger" onClick={() => void remove()} disabled={busy}>
                      Supprimer
                    </Button>
                    <Button variant="secondary" onClick={() => setConfirmDelete(false)} disabled={busy}>
                      Annuler
                    </Button>
                  </div>
                </>
              ) : (
                <Button variant="ghost" onClick={() => setConfirmDelete(true)}>
                  <IconDelete size={16} aria-hidden /> Supprimer la fiche
                </Button>
              )}
            </section>
          )}
        </div>
      </div>

      {zoomed && (
        <div className="lightbox" role="dialog" aria-modal="true" onClick={() => setZoom(null)}>
          <AuthImage
            subjectId={subject.id}
            view={zoomed.view}
            version={zoomed.sha256}
            alt={VIEWS[zoomed.view].label}
            className="lightboxImg"
          />
          <p className="lightboxCaption">{VIEWS[zoomed.view].label} — touchez pour fermer</p>
        </div>
      )}
    </>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Detail />
    </Suspense>
  );
}
