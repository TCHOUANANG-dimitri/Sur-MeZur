"use client";

/**
 * Formulaire d'une fiche, en quatre etapes : volontaire, mensurations,
 * photos, verification. Sert a la CREATION et a la MODIFICATION.
 *
 * Creation : tout est ecrit sur l'appareil au fil de la saisie (brouillon
 * IndexedDB), puis l'enregistrement place la fiche dans la file d'envoi — la
 * saisie ne depend jamais du reseau.
 * Modification : envoi direct au serveur (une fiche existante se corrige au
 * bureau ou avec du reseau, pas en pleine seance).
 */

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "./AuthProvider";
import { useOutbox } from "./OutboxProvider";
import { PhotoSlot } from "./PhotoSlot";
import { Button, Chip, ErrorBanner, Field, InfoBanner, Input, Steps, Textarea } from "./ui";
import { IconCheck, IconInfo, IconWarning } from "./icons";
import { ApiError } from "@/lib/api/client";
import { CollecteApi, type Subject, type SubjectCreate, type SubjectFields } from "@/lib/api/collecte";
import { getDraft, newUuid, putDraft, putOutbox, removeDraft } from "@/lib/outbox";
import {
  BODY_BOUNDS,
  CLOTHING_LABELS,
  GENDER_LABELS,
  MEASURE_GROUPS,
  MEASURE_KEYS,
  MEASURES,
  REQUIRED_VIEWS,
  SHOOTING_RULES,
  VIEW_KEYS,
  VIEWS,
  checkValue,
  formatCm,
  parseNumber,
  type Check,
  type Clothing,
  type Gender,
  type MeasureKey,
  type ViewKey,
} from "@/lib/protocol";

interface FormState {
  gender: Gender | "";
  age: string;
  height: string;
  weight: string;
  clothing: Clothing | "";
  city: string;
  place: string;
  measuredBy: string;
  measuredAt: string;
  notes: string;
  consent: boolean;
  consentName: string;
  measures: Record<MeasureKey, string>;
}

const STEPS = ["Volontaire", "Mensurations", "Photos", "Vérification"];

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function emptyMeasures(): Record<MeasureKey, string> {
  return Object.fromEntries(MEASURE_KEYS.map((k) => [k, ""])) as Record<MeasureKey, string>;
}

function emptyForm(measuredBy: string): FormState {
  return {
    gender: "",
    age: "",
    height: "",
    weight: "",
    clothing: "",
    city: "",
    place: "",
    measuredBy,
    measuredAt: today(),
    notes: "",
    consent: false,
    consentName: "",
    measures: emptyMeasures(),
  };
}

function numStr(v: number | null | undefined): string {
  return v === null || v === undefined ? "" : String(v).replace(".", ",");
}

function fromSubject(s: Subject): FormState {
  const measures = emptyMeasures();
  for (const k of MEASURE_KEYS) measures[k] = numStr(s.measurements[k]);
  return {
    gender: s.gender,
    age: numStr(s.age),
    height: numStr(s.height_cm),
    weight: numStr(s.weight_kg),
    clothing: s.clothing ?? "",
    city: s.city ?? "",
    place: s.place ?? "",
    measuredBy: s.measured_by ?? "",
    measuredAt: s.measured_at ? s.measured_at.slice(0, 10) : "",
    notes: s.notes ?? "",
    consent: s.consent,
    consentName: s.consent_name ?? "",
    measures,
  };
}

/** Champs communs, prets pour l'API. Suppose le formulaire deja valide. */
function toFields(f: FormState): SubjectFields {
  const measurements: SubjectFields["measurements"] = {};
  for (const k of MEASURE_KEYS) {
    const v = parseNumber(f.measures[k]);
    if (v !== null) measurements[k] = v;
  }
  const opt = (s: string) => (s.trim() ? s.trim() : null);
  return {
    gender: f.gender as Gender,
    age: parseNumber(f.age),
    height_cm: parseNumber(f.height) as number,
    weight_kg: parseNumber(f.weight) as number,
    measurements,
    clothing: (f.clothing || null) as Clothing | null,
    city: opt(f.city),
    place: opt(f.place),
    measured_by: opt(f.measuredBy),
    // Midi local : une date seule serait lue a minuit UTC et pourrait
    // basculer sur la veille selon le fuseau.
    measured_at: f.measuredAt ? new Date(`${f.measuredAt}T12:00:00`).toISOString() : null,
    notes: opt(f.notes),
    consent_name: opt(f.consentName),
  };
}

function bodyChecks(f: FormState) {
  return {
    height: checkValue(parseNumber(f.height), BODY_BOUNDS.height_cm.usual, BODY_BOUNDS.height_cm.hard),
    weight: checkValue(parseNumber(f.weight), BODY_BOUNDS.weight_kg.usual, BODY_BOUNDS.weight_kg.hard, "kg"),
    age: checkValue(parseNumber(f.age), BODY_BOUNDS.age.usual, BODY_BOUNDS.age.hard, "ans"),
  };
}

function measureCheck(f: FormState, k: MeasureKey): Check {
  const raw = f.measures[k];
  if (raw.trim() && parseNumber(raw) === null) return { level: "error", message: "Nombre attendu (ex. 84,5)." };
  return checkValue(parseNumber(raw), MEASURES[k].usual, MEASURES[k].hard);
}

function CheckLine({ check }: { check: Check }) {
  if (check.level === "ok" || !check.message) return null;
  return (
    <span className={check.level === "error" ? "checkError" : "checkWarn"} role={check.level === "error" ? "alert" : undefined}>
      <IconWarning size={14} aria-hidden /> {check.message}
    </span>
  );
}

function MeasureInput({
  k,
  value,
  onChange,
  check,
}: {
  k: MeasureKey;
  value: string;
  onChange: (v: string) => void;
  check: Check;
}) {
  const spec = MEASURES[k];
  return (
    <div className={`measureRow ${check.level !== "ok" ? `measureRow-${check.level}` : ""}`}>
      <label className="measureLabel" htmlFor={`m-${k}`}>
        {spec.label}
      </label>
      <div className="measureInputWrap">
        <input
          id={`m-${k}`}
          className="input measureInput"
          inputMode="decimal"
          enterKeyHint="next"
          autoComplete="off"
          placeholder="—"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^0-9.,]/g, ""))}
        />
        <span className="measureUnit">cm</span>
      </div>
      <details className="measureHow">
        <summary>
          <IconInfo size={14} aria-hidden /> Comment mesurer
        </summary>
        <p>{spec.how}</p>
      </details>
      <CheckLine check={check} />
    </div>
  );
}

export function SubjectForm({ subject }: { subject?: Subject }) {
  const editing = !!subject;
  const router = useRouter();
  const { user } = useAuth();
  const { reload, sync } = useOutbox();
  const draftId = `nouvelle-${user?.id ?? "anonyme"}`;

  const [form, setForm] = useState<FormState>(() => (subject ? fromSubject(subject) : emptyForm(user?.full_name ?? "")));
  const [photos, setPhotos] = useState<Partial<Record<ViewKey, Blob>>>({});
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [draftLoaded, setDraftLoaded] = useState(editing);
  const [resumed, setResumed] = useState(false);
  const [savedCode, setSavedCode] = useState<string | null>(null);
  const topRef = useRef<HTMLDivElement>(null);

  // --- Brouillon (creation uniquement) -------------------------------------
  useEffect(() => {
    if (editing) return;
    let cancelled = false;
    getDraft(draftId)
      .then((d) => {
        if (cancelled || !d) return;
        setForm({ ...emptyForm(user?.full_name ?? ""), ...(d.form as unknown as FormState) });
        setPhotos(d.photos ?? {});
        setStep(d.step ?? 0);
        setResumed(true);
      })
      .catch(() => {})
      .finally(() => !cancelled && setDraftLoaded(true));
    return () => {
      cancelled = true;
    };
  }, [editing, draftId, user?.full_name]);

  useEffect(() => {
    if (editing || !draftLoaded || !user) return;
    const t = setTimeout(() => {
      void putDraft({
        id: draftId,
        owner_id: user.id,
        updated_at: new Date().toISOString(),
        step,
        form: form as unknown as Record<string, string>,
        photos,
      }).catch(() => {});
    }, 400);
    return () => clearTimeout(t);
  }, [editing, draftLoaded, user, draftId, form, photos, step]);

  const restart = useCallback(async () => {
    await removeDraft(draftId).catch(() => {});
    setForm(emptyForm(user?.full_name ?? ""));
    setPhotos({});
    setStep(0);
    setResumed(false);
    setError("");
  }, [draftId, user?.full_name]);

  // --- Controles -----------------------------------------------------------
  const body = useMemo(() => bodyChecks(form), [form]);
  const mChecks = useMemo(
    () => Object.fromEntries(MEASURE_KEYS.map((k) => [k, measureCheck(form, k)])) as Record<MeasureKey, Check>,
    [form]
  );
  const missingMeasures = MEASURE_KEYS.filter((k) => !form.measures[k].trim());
  const remoteViews = new Set((subject?.photos ?? []).map((p) => p.view));
  const missingViews = REQUIRED_VIEWS.filter((v) => !photos[v] && !remoteViews.has(v));
  const warnCount =
    MEASURE_KEYS.filter((k) => mChecks[k].level === "warn").length +
    Object.values(body).filter((c) => c.level === "warn").length;

  function stepErrors(s: number): string | null {
    if (s === 0) {
      if (!form.gender) return "Indiquez le sexe du volontaire.";
      if (parseNumber(form.height) === null) return "La taille est obligatoire.";
      if (parseNumber(form.weight) === null) return "Le poids est obligatoire.";
      const bad = Object.values(body).find((c) => c.level === "error");
      if (bad) return bad.message ?? "Valeur impossible.";
      if (!editing && !form.consent) return "Le consentement du volontaire est obligatoire avant toute mesure ou photo.";
    }
    if (s === 1) {
      const k = MEASURE_KEYS.find((key) => mChecks[key].level === "error");
      if (k) return `${MEASURES[k].label} : ${mChecks[k].message}`;
    }
    return null;
  }

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function setMeasure(k: MeasureKey, v: string) {
    setForm((f) => ({ ...f, measures: { ...f.measures, [k]: v } }));
  }

  function goTo(next: number) {
    for (let s = 0; s < Math.min(next, STEPS.length - 1); s++) {
      const e = stepErrors(s);
      if (e) {
        setError(e);
        setStep(s);
        topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
    }
    setError("");
    setStep(next);
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // --- Enregistrement ------------------------------------------------------
  async function saveNew(andNext: boolean) {
    if (!user) return;
    const e = stepErrors(0) ?? stepErrors(1);
    if (e) return setError(e);
    setBusy(true);
    setError("");
    try {
      const payload: SubjectCreate = { ...toFields(form), client_uuid: newUuid(), consent: true };
      await putOutbox({
        client_uuid: payload.client_uuid,
        owner_id: user.id,
        created_at: new Date().toISOString(),
        payload,
        photos,
        uploaded: [],
        attempts: 0,
      });
      await removeDraft(draftId).catch(() => {});
      await reload();
      void sync();
      if (andNext) {
        setSavedCode("ok");
        setForm({ ...emptyForm(form.measuredBy), city: form.city, place: form.place, measuredAt: form.measuredAt });
        setPhotos({});
        setStep(0);
        setResumed(false);
        topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      } else {
        router.push("/tableau-de-bord?enregistre=1");
      }
    } catch (err) {
      setError(
        `La fiche n'a pas pu être enregistrée sur cet appareil (${err instanceof Error ? err.message : "erreur"}). Ne fermez pas la page.`
      );
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit() {
    if (!subject) return;
    const e = stepErrors(0) ?? stepErrors(1);
    if (e) return setError(e);
    setBusy(true);
    setError("");
    try {
      const fields = toFields(form);
      // Une mesure videe doit disparaitre cote serveur : le dictionnaire est
      // envoye en entier, il remplace l'ancien.
      await CollecteApi.update(subject.id, fields);
      for (const [view, blob] of Object.entries(photos) as [ViewKey, Blob][]) {
        if (blob) await CollecteApi.uploadPhoto(subject.id, view, blob);
      }
      router.push(`/sujets/${subject.id}?modifie=1`);
    } catch (err) {
      setError(
        err instanceof TypeError
          ? "Pas de connexion : la modification d'une fiche existante demande du réseau. Réessayez plus tard."
          : err instanceof ApiError
            ? err.message
            : "La modification a échoué."
      );
    } finally {
      setBusy(false);
    }
  }

  if (!draftLoaded) return null;

  return (
    <div className="containerNarrow section" ref={topRef}>
      <div className="formHead">
        <Steps total={STEPS.length} current={step + 1} />
        <p className="stepName">
          Étape {step + 1} / {STEPS.length} — <strong>{STEPS[step]}</strong>
        </p>
      </div>

      {savedCode && step === 0 && (
        <InfoBanner>
          <IconCheck size={16} aria-hidden /> Fiche précédente enregistrée sur l&apos;appareil, envoi en cours. Saisissez la suivante.
        </InfoBanner>
      )}
      {/* A toutes les etapes : on reprend la ou l'agent s'etait arrete. */}
      {resumed && !savedCode && (
        <InfoBanner>
          Brouillon repris là où vous l&apos;aviez laissé.{" "}
          <button type="button" className="linkBtn" onClick={() => void restart()}>
            Recommencer à zéro
          </button>
        </InfoBanner>
      )}
      <ErrorBanner message={error} />

      {/* ---------------------------------------------------------------- */}
      {step === 0 && (
        <div className="stack">
          <div className="field">
            <span className="fieldLabel">Sexe *</span>
            <div className="chipRow chipRowWrap">
              {(Object.keys(GENDER_LABELS) as Gender[]).map((g) => (
                <Chip key={g} type="button" active={form.gender === g} onClick={() => set("gender", g)}>
                  {GENDER_LABELS[g]}
                </Chip>
              ))}
            </div>
          </div>

          <div className="fieldGrid3">
            <Field label="Taille (cm) *">
              <Input inputMode="decimal" value={form.height} onChange={(e) => set("height", e.target.value)} placeholder="175" />
              <CheckLine check={body.height} />
            </Field>
            <Field label="Poids (kg) *">
              <Input inputMode="decimal" value={form.weight} onChange={(e) => set("weight", e.target.value)} placeholder="70" />
              <CheckLine check={body.weight} />
            </Field>
            <Field label="Âge">
              <Input inputMode="numeric" value={form.age} onChange={(e) => set("age", e.target.value)} placeholder="30" />
              <CheckLine check={body.age} />
            </Field>
          </div>
          <p className="fieldHint hintTop">Taille et poids MESURÉS (toise, balance), pas déclarés : la chaîne s&apos;en sert d&apos;échelle.</p>

          <div className="field">
            <span className="fieldLabel">Tenue sur les photos</span>
            <div className="chipRow chipRowWrap">
              {(Object.keys(CLOTHING_LABELS) as Clothing[]).map((c) => (
                <Chip key={c} type="button" active={form.clothing === c} onClick={() => set("clothing", form.clothing === c ? "" : c)}>
                  {CLOTHING_LABELS[c]}
                </Chip>
              ))}
            </div>
          </div>

          <div className="fieldGrid2">
            <Field label="Ville">
              <Input value={form.city} onChange={(e) => set("city", e.target.value)} placeholder="Douala" />
            </Field>
            <Field label="Lieu de la séance">
              <Input value={form.place} onChange={(e) => set("place", e.target.value)} placeholder="Atelier, école…" />
            </Field>
            <Field label="Mesuré par">
              <Input value={form.measuredBy} onChange={(e) => set("measuredBy", e.target.value)} />
            </Field>
            <Field label="Date de la mesure">
              <Input type="date" value={form.measuredAt} onChange={(e) => set("measuredAt", e.target.value)} />
            </Field>
          </div>

          <div className="consentBox">
            <label className="checkRow">
              <input
                type="checkbox"
                checked={form.consent}
                disabled={editing}
                onChange={(e) => set("consent", e.target.checked)}
              />
              <span>
                <strong>Le volontaire accepte</strong> que ses mensurations et ses photos soient conservées par
                Sur-MeZur pour améliorer la prise de mesure. Elles ne seront jamais publiées ni associées à son nom en
                dehors de cette fiche. *
              </span>
            </label>
            <Field label="Nom du volontaire (preuve du consentement, jamais exporté)">
              <Input value={form.consentName} onChange={(e) => set("consentName", e.target.value)} />
            </Field>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {step === 1 && (
        <div className="stack">
          <InfoBanner>
            <IconInfo size={16} aria-hidden /> Au mètre ruban, sur un vêtement fin ou à même la peau. Touchez « Comment
            mesurer » en cas de doute : tous les agents doivent prendre exactement la même chose.
          </InfoBanner>
          {MEASURE_GROUPS.map((g) => (
            <section key={g.id} className="card measureGroup">
              <h3 className="groupTitle">{g.title}</h3>
              {g.keys.map((k) => (
                <MeasureInput key={k} k={k} value={form.measures[k]} onChange={(v) => setMeasure(k, v)} check={mChecks[k]} />
              ))}
            </section>
          ))}
          <p className="muted small">
            {12 - missingMeasures.length} / 12 mesures saisies.
            {missingMeasures.length > 0 && " Une fiche incomplète est gardée, mais ne sert pas à l'entraînement."}
          </p>
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {step === 2 && (
        <div className="stack">
          <section className="card cardFlat">
            <h3 className="groupTitle">Avant de photographier</h3>
            <ul className="rules">
              {SHOOTING_RULES.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </section>
          {VIEW_KEYS.map((v) => {
            const remote = subject?.photos.find((p) => p.view === v);
            return (
              <PhotoSlot
                key={v}
                view={v}
                blob={photos[v] ?? null}
                remote={remote && subject ? { subjectId: subject.id, version: remote.sha256 } : null}
                onChange={(b) =>
                  setPhotos((p) => {
                    const next = { ...p };
                    if (b) next[v] = b;
                    else delete next[v];
                    return next;
                  })
                }
                disabled={busy}
              />
            );
          })}
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {step === 3 && (
        <div className="stack">
          <section className="card">
            <h3 className="groupTitle">
              {form.gender ? GENDER_LABELS[form.gender] : "—"} · {form.height || "—"} cm · {form.weight || "—"} kg
              {form.age ? ` · ${form.age} ans` : ""}
            </h3>
            <dl className="recap">
              {MEASURE_KEYS.map((k) => (
                <div key={k} className={`recapRow ${mChecks[k].level !== "ok" ? `recap-${mChecks[k].level}` : ""}`}>
                  <dt>{MEASURES[k].label}</dt>
                  <dd>{form.measures[k].trim() ? formatCm(parseNumber(form.measures[k])) : <span className="missing">manquante</span>}</dd>
                </div>
              ))}
            </dl>
            <p className="muted small">
              Photos :{" "}
              {VIEW_KEYS.filter((v) => photos[v] || remoteViews.has(v))
                .map((v) => VIEWS[v].label)
                .join(", ") || "aucune"}
            </p>
          </section>

          {(missingMeasures.length > 0 || missingViews.length > 0) && (
            <div className="banner bannerWarn" role="status">
              <IconWarning size={18} aria-hidden />
              <span>
                Fiche incomplète :
                {missingMeasures.length > 0 && ` ${missingMeasures.length} mesure(s) manquante(s)`}
                {missingMeasures.length > 0 && missingViews.length > 0 && ","}
                {missingViews.length > 0 && ` photo(s) ${missingViews.map((v) => VIEWS[v].label.toLowerCase()).join(" et ")} manquante(s)`}
                . Vous pourrez la compléter plus tard depuis la liste des fiches.
              </span>
            </div>
          )}
          {warnCount > 0 && (
            <p className="checkWarn">
              <IconWarning size={14} aria-hidden /> {warnCount} valeur(s) inhabituelle(s), surlignée(s) ci-dessus : revérifiez
              au mètre avant d&apos;enregistrer.
            </p>
          )}

          <Field label="Remarques (posture, vêtement, incident…)">
            <Textarea rows={3} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
          </Field>
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      <div className="actionBar formActions">
        {step > 0 && (
          <Button type="button" variant="secondary" onClick={() => goTo(step - 1)} disabled={busy}>
            Retour
          </Button>
        )}
        {step < STEPS.length - 1 ? (
          <Button type="button" onClick={() => goTo(step + 1)} className="grow">
            Continuer
          </Button>
        ) : editing ? (
          <Button type="button" onClick={() => void saveEdit()} disabled={busy} className="grow">
            {busy ? "Enregistrement…" : "Enregistrer les modifications"}
          </Button>
        ) : (
          <>
            <Button type="button" variant="secondary" onClick={() => void saveNew(false)} disabled={busy}>
              Enregistrer
            </Button>
            <Button type="button" onClick={() => void saveNew(true)} disabled={busy} className="grow">
              {busy ? "Enregistrement…" : "Enregistrer et suivant"}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
