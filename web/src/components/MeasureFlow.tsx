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
 * POSTURE DES BRAS. De profil, bras colles le long du corps : c'est la
 * posture pour laquelle la bande d'effacement du bras est calibree (voir
 * Silhouettes.tsx). De face en revanche, les bras restent ecartes : colles,
 * cette meme bande — plus large de face — rognerait le bord du torse et
 * sous-estimerait poitrine, taille et hanches.
 *
 * PHOTOS. Chaque photo se prend a la camera OU s'importe depuis la galerie,
 * sur telephone comme sur ordinateur. La prise de vue passe par la camera du
 * navigateur (CameraCapture), avec silhouette et retardateur ; si la page
 * n'est pas en contexte securise, elle retombe sur `<input capture>`, qui
 * ouvre l'appareil photo natif du telephone.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { MeasurementsApi } from "@/lib/api/endpoints";
import { ensureSession } from "@/lib/guest";
import { useAuth } from "./AuthProvider";
import { Button, ErrorBanner, Field, Input, Select, Spinner, Steps } from "./ui";
import {
  IconCamera,
  IconCheck,
  IconFrame,
  IconGallery,
  IconInfo,
  IconLight,
  IconModels,
  IconPhone,
} from "./icons";
import { SilhouetteFace, SilhouetteProfil } from "./Silhouettes";
import { CameraCapture, cameraSupported, type CaptureTarget } from "./CameraCapture";

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
    <div className="measureFlow">
      <Steps total={4} current={STEP_INDEX[step]} />
      <ErrorBanner message={error} />

      {step === "infos" && (
        <div className="flowForm">
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

          <div className="actionBar flowActions">
            <Button block disabled={!infosValid} onClick={() => go("consignes")}>
              Continuer
            </Button>
          </div>
        </div>
      )}

      {step === "consignes" && (
        <>
          <h2>Avant vos photos</h2>
          <p className="muted flowLead">
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
                "Bras collés le long du corps, mains détendues",
                "Dos droit, jambes jointes",
              ]}
            />
          </div>

          <div className="actionBar flowActions">
            <Button variant="secondary" onClick={() => go("infos")}>
              Retour
            </Button>
            <Button block onClick={() => go("photos")}>
              J&apos;ai compris
            </Button>
          </div>
        </>
      )}

      {step === "photos" && (
        <>
          <h2>Vos deux photos</h2>
          <p className="muted flowLead">
            Prenez-les maintenant avec votre appareil, ou importez-les si elles sont déjà
            dans votre galerie.
          </p>
          <button type="button" className="guideRecall" onClick={() => go("consignes")}>
            <IconInfo size={15} aria-hidden /> Revoir les consignes de posture
          </button>

          <div className="photoCards">
            <PhotoPicker
              target="front"
              label="Photo de face"
              hint="Face à l'appareil, bras écartés, corps entier dans le cadre."
              file={front}
              onPick={setFront}
            />
            <PhotoPicker
              target="side"
              label="Photo de profil"
              hint="De profil, bras collés le long du corps."
              file={side}
              onPick={setSide}
            />
          </div>

          <div className="actionBar flowActions">
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
        <div className="flowAnalyse">
          <Spinner label="Analyse de vos photos…" />
          <p className="muted">
            Cela prend généralement moins d&apos;une minute. Ne fermez pas cette page.
          </p>
        </div>
      )}
    </div>
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
      <div className="guideFigureWrap">
        <Figure className="guideFigure" />
      </div>
      <div className="guidePoseText">
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
  target,
  label,
  hint,
  file,
  onPick,
}: {
  target: CaptureTarget;
  label: string;
  hint: string;
  file: File | null;
  onPick: (f: File) => void;
}) {
  const nativeCameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);

  // L'URL d'apercu garde l'image en memoire tant qu'elle n'est pas revoquee.
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  function accept(f: File) {
    onPick(f);
    setPreview(URL.createObjectURL(f));
  }

  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    // Remise a zero : sans elle, choisir deux fois le meme fichier (apres une
    // erreur d'analyse, par exemple) ne declencherait aucun evenement.
    e.target.value = "";
    if (f) accept(f);
  }

  function openCamera() {
    if (cameraSupported()) setCameraOpen(true);
    else nativeCameraRef.current?.click();
  }

  return (
    <section className={`photoCard ${file ? "photoCardDone" : ""}`}>
      <div className="photoCardMedia">
        {preview ? (
          // next/image n'apporte rien sur une URL blob locale, et imposerait des
          // dimensions connues a l'avance.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt={`Aperçu - ${label}`} />
        ) : (
          <span className="photoCardPlaceholder" aria-hidden>
            <IconCamera size={26} strokeWidth={1.7} />
          </span>
        )}
      </div>

      <div className="photoCardBody">
        <h3 className="photoCardTitle">
          {label}
          {file ? (
            <span className="photoDone" aria-label="Photo choisie">
              <IconCheck size={15} strokeWidth={3} />
            </span>
          ) : null}
        </h3>
        <p className="fieldHint">{file ? "Photo prête. Vous pouvez la remplacer." : hint}</p>
      </div>

      {/* Boutons hors du bloc de texte : places sur toute la largeur de la
          carte, sous la vignette. A cote d'elle, chacun ne gardait qu'une
          centaine de pixels au telephone. */}
      <div className="photoCardActions">
        <button type="button" className="btn btnSecondary" onClick={openCamera}>
          <IconCamera size={17} aria-hidden />
          {file ? "Reprendre" : "Prendre la photo"}
        </button>
        <button type="button" className="btn btnGhost" onClick={() => galleryRef.current?.click()}>
          <IconGallery size={17} aria-hidden />
          {file ? "Changer" : "Importer"}
        </button>
      </div>

      {/* Repli hors contexte securise : appareil photo natif du telephone. */}
      <input ref={nativeCameraRef} type="file" accept="image/*" capture="environment" hidden onChange={handleInput} />
      <input ref={galleryRef} type="file" accept="image/*" hidden onChange={handleInput} />

      {cameraOpen && (
        <CameraCapture
          target={target}
          onCapture={(f) => {
            setCameraOpen(false);
            accept(f);
          }}
          onClose={() => setCameraOpen(false)}
        />
      )}
    </section>
  );
}
