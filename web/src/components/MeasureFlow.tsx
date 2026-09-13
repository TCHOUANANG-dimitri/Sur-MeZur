"use client";

/**
 * Parcours de prise de mesure, partage entre le visiteur sans compte
 * (/mesurer) et le client inscrit (/mesures/nouvelle).
 *
 * Quatre etapes : informations, consignes de posture, photos, analyse.
 *
 * LES CONSIGNES ONT LEUR PROPRE ECRAN, avant l'envoi des photos, et non un
 * simple bandeau sur l'ecran d'envoi. Le rapport de projet l'a mesure : le
 * vetement ample peut introduire jusqu'a 24 cm d'ecart, et la posture de
 * profil est le maillon le plus fragile de toute la chaine. Un bandeau se
 * survole ; un ecran dedie, avec les deux silhouettes, se lit.
 *
 * CAPTURE. `<input type="file" capture>` ouvre l'appareil photo natif, et non
 * `getUserMedia` : ce dernier exige HTTPS, que l'API n'a pas encore.
 */

import { useCallback, useRef, useState } from "react";
import { MeasurementsApi } from "@/lib/api/endpoints";
import { ensureSession } from "@/lib/guest";
import { useAuth } from "./AuthProvider";
import { Button, ErrorBanner, Field, Input, Select, Spinner, Steps } from "./ui";
import {
  IconCamera,
  IconCheck,
  IconFrame,
  IconInfo,
  IconLight,
  IconModels,
  IconPhone,
} from "./icons";
import { SilhouetteFace, SilhouetteProfil } from "./Silhouettes";

type Step = "infos" | "consignes" | "photos" | "analyse";

const STEP_INDEX: Record<Step, number> = { infos: 1, consignes: 2, photos: 3, analyse: 4 };

/** L'analyse prend quelques secondes a une minute et demie selon la charge
 *  du serveur : trois minutes de marge avant d'abandonner, plutot que
 *  d'annoncer un echec sur une mesure qui aurait abouti. */
const POLL_INTERVAL_MS = 2500;
const POLL_MAX = 72;

type IconType = React.ComponentType<{ size?: number; strokeWidth?: number }>;

export function MeasureFlow({
  guest = false,
  onDone,
}: {
  /** Visiteur sans compte : un compte invite est cree avant l'envoi. */
  guest?: boolean;
  onDone: (measurementId: string) => void;
}) {
  const { refresh } = useAuth();
  const [step, setStep] = useState<Step>("infos");
  const [height, setHeight] = useState("");
  const [weight, setWeight] = useState("");
  const [gender, setGender] = useState("");
  const [front, setFront] = useState<File | null>(null);
  const [side, setSide] = useState<File | null>(null);
  const [error, setError] = useState("");

  const infosValid =
    Number(height) >= 100 &&
    Number(height) <= 230 &&
    Number(weight) >= 25 &&
    Number(weight) <= 250 &&
    gender !== "";

  // Chaque etape est un ecran a part entiere : on revient en haut, sans quoi
  // un telephone afficherait la nouvelle etape a la hauteur de defilement de
  // la precedente.
  const go = useCallback((next: Step) => {
    setStep(next);
    if (typeof window !== "undefined") window.scrollTo({ top: 0 });
  }, []);

  const analyse = useCallback(async () => {
    if (!front || !side) return;
    setError("");
    go("analyse");
    try {
      // Le compte invite n'est cree qu'ici, au moment d'envoyer les photos :
      // un visiteur qui abandonne sur les consignes ne laisse aucune trace.
      if (guest && (await ensureSession())) await refresh();

      const session = await MeasurementsApi.createSession({
        height_cm: Number(height),
        weight_kg: Number(weight),
        gender,
      });
      let current = await MeasurementsApi.uploadPhotos(session.id, front, side);

      for (let i = 0; i < POLL_MAX && current.status === "processing"; i++) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        current = await MeasurementsApi.getSession(session.id);
      }

      if (current.status !== "ready" || !current.measurement_id) {
        throw new Error(
          current.error_message ||
            "Nous n'avons pas réussi à lire vos photos. Reprenez-les en vous plaçant bien en entier dans le cadre."
        );
      }
      onDone(current.measurement_id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "L'analyse a échoué.");
      go("photos");
    }
  }, [front, side, height, weight, gender, guest, refresh, onDone, go]);

  return (
    <>
      <Steps total={4} current={STEP_INDEX[step]} />
      <ErrorBanner message={error} />

      {step === "infos" && (
        <>
          <h2>Quelques informations</h2>
          <p className="muted">
            Votre taille et votre poids servent à convertir ce que voient les photos en
            centimètres. Sans eux, aucune mesure n&apos;est possible.
          </p>

          <div className="fieldRow" style={{ marginTop: 20 }}>
            <Field label="Votre taille (cm)">
              <Input
                type="number"
                inputMode="numeric"
                min={100}
                max={230}
                placeholder="175"
                value={height}
                onChange={(e) => setHeight(e.target.value)}
              />
            </Field>
            <Field label="Votre poids (kg)">
              <Input
                type="number"
                inputMode="numeric"
                min={25}
                max={250}
                placeholder="70"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
              />
            </Field>
          </div>

          <Field
            label="Vous êtes"
            hint="Les proportions du corps diffèrent ; la mesure en tient compte."
          >
            <Select value={gender} onChange={(e) => setGender(e.target.value)}>
              <option value="">Choisir…</option>
              <option value="female">Une femme</option>
              <option value="male">Un homme</option>
            </Select>
          </Field>

          <div className="actionBar">
            <Button block disabled={!infosValid} onClick={() => go("consignes")}>
              Continuer
            </Button>
          </div>
        </>
      )}

      {step === "consignes" && (
        <>
          <h2>Avant vos photos</h2>
          <p className="muted">
            La précision de vos mesures dépend presque entièrement de ces quelques règles.
            Prenez un instant pour les lire.
          </p>

          <ul className="guideRules">
            <Rule
              Icon={IconModels}
              title="Tenue ajustée"
              body="Un vêtement ample fausse la mesure : portez une tenue près du corps."
            />
            <Rule
              Icon={IconPhone}
              title="Téléphone posé"
              body="À 2,5–3 m de vous, à hauteur de poitrine. Faites-vous aider ou utilisez un support."
            />
            <Rule
              Icon={IconFrame}
              title="Corps entier"
              body="De la tête aux pieds dans le cadre, devant un mur dégagé."
            />
            <Rule
              Icon={IconLight}
              title="Bonne lumière"
              body="Un endroit bien éclairé, sans contre-jour."
            />
          </ul>

          <div className="guidePoses">
            <Pose
              title="Photo de face"
              Figure={SilhouetteFace}
              points={[
                "Face à l'appareil, regard droit devant",
                "Bras écartés du corps, à environ 45°",
                "Jambes légèrement séparées",
              ]}
            />
            <Pose
              title="Photo de profil"
              Figure={SilhouetteProfil}
              points={[
                "De profil, l'épaule tournée vers l'appareil",
                "Mains croisées dans le dos, dos droit",
                "Jambes jointes",
              ]}
            />
          </div>

          <div className="actionBar">
            <Button variant="secondary" onClick={() => go("infos")}>
              Retour
            </Button>
            <Button block onClick={() => go("photos")}>
              J&apos;ai compris, prendre mes photos
            </Button>
          </div>
        </>
      )}

      {step === "photos" && (
        <>
          <h2>Vos deux photos</h2>
          <button type="button" className="guideRecall" onClick={() => go("consignes")}>
            <IconInfo size={15} aria-hidden /> Revoir les consignes de posture
          </button>

          <PhotoPicker
            label="Photo de face"
            hint="Face à l'appareil, bras écartés, corps entier dans le cadre."
            file={front}
            onPick={setFront}
          />
          <PhotoPicker
            label="Photo de profil"
            hint="De profil, mains croisées dans le dos."
            file={side}
            onPick={setSide}
          />

          <div className="actionBar">
            <Button variant="secondary" onClick={() => go("consignes")}>
              Retour
            </Button>
            <Button block disabled={!front || !side} onClick={analyse}>
              Analyser mes photos
            </Button>
          </div>
        </>
      )}

      {step === "analyse" && (
        <div style={{ paddingTop: 40 }}>
          <Spinner label="Analyse de vos photos…" />
          <p className="muted" style={{ textAlign: "center" }}>
            Cela prend généralement moins d&apos;une minute. Ne fermez pas cette page.
          </p>
        </div>
      )}
    </>
  );
}

function Rule({ Icon, title, body }: { Icon: IconType; title: string; body: string }) {
  return (
    <li className="guideRule">
      <span className="guideRuleIcon" aria-hidden>
        <Icon size={18} strokeWidth={1.9} />
      </span>
      <span>
        <strong>{title}</strong>
        {body}
      </span>
    </li>
  );
}

function Pose({
  title,
  Figure,
  points,
}: {
  title: string;
  Figure: React.ComponentType<{ className?: string }>;
  points: string[];
}) {
  return (
    <section className="guidePose">
      <Figure className="guideFigure" />
      <div>
        <h3>{title}</h3>
        <ul className="guidePoseList">
          {points.map((p) => (
            <li key={p}>
              <IconCheck size={15} strokeWidth={2.6} aria-hidden />
              <span>{p}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function PhotoPicker({
  label,
  hint,
  file,
  onPick,
}: {
  label: string;
  hint: string;
  file: File | null;
  onPick: (f: File) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);

  return (
    <button type="button" className="photoPicker" onClick={() => ref.current?.click()}>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          onPick(f);
          setPreview((old) => {
            if (old) URL.revokeObjectURL(old);
            return URL.createObjectURL(f);
          });
        }}
      />
      {preview ? (
        // next/image n'apporte rien sur une URL blob locale, et imposerait des
        // dimensions connues a l'avance.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt={`Aperçu - ${label}`} className="photoPreview" />
      ) : (
        <span className="photoPlaceholder" aria-hidden>
          <IconCamera size={26} strokeWidth={1.7} />
        </span>
      )}
      <span className="photoPickerText">
        <span className="photoPickerLabel">
          {label}
          {file ? (
            <span className="photoDone" aria-label="Photo choisie">
              <IconCheck size={15} strokeWidth={3} />
            </span>
          ) : null}
        </span>
        <span className="fieldHint">{file ? "Appuyez pour reprendre" : hint}</span>
      </span>
    </button>
  );
}
