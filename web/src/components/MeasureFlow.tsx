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

import { tr } from "@/lib/i18n";
import { useCallback, useEffect, useRef, useState } from "react";
import { MeasurementsApi } from "@/lib/api/endpoints";
import type { JobStatus } from "@/lib/api/types";
import { ensureSession } from "@/lib/guest";
import { compressForMeasurement, photoErrorMessage } from "@/lib/imageCompress";
import { ApiError } from "@/lib/api/client";
import { friendlyError, withRetry } from "@/lib/retry";
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

/**
 * Source des sessions de mesure. Par defaut les routes client ; l'espace
 * tailleur injecte ici les routes tailleur (`/tailleur/mesurer`), sans
 * dupliquer le parcours (consignes, photos, analyse).
 */
export interface FlowSession {
  id: string;
  status: JobStatus;
  measurement_id: string | null;
  error_message?: string | null;
}

export interface MeasureSessionApi {
  createSession: (body: { height_cm: number; weight_kg?: number; gender?: string }) => Promise<FlowSession>;
  uploadPhotos: (sessionId: string, front: File, side: File) => Promise<FlowSession>;
  getSession: (sessionId: string) => Promise<FlowSession>;
}

export function MeasureFlow({
  guest = false,
  onDone,
  sessionApi,
  forClient = false,
}: {
  /** Visiteur sans compte : un compte invite est cree avant l'envoi. */
  guest?: boolean;
  onDone: (measurementId: string) => void;
  sessionApi?: MeasureSessionApi;
  /** Un tailleur mesure son client : les textes parlent du client, pas de « vous ». */
  forClient?: boolean;
}) {
  const { refresh } = useAuth();
  const [step, setStep] = useState<Step>("infos");
  const [height, setHeight] = useState("");
  const [weight, setWeight] = useState("");
  const [gender, setGender] = useState("");
  const [front, setFront] = useState<File | null>(null);
  const [side, setSide] = useState<File | null>(null);
  const [error, setError] = useState("");
  // Etape en echec et erreur brute, affichees en petit sous le message : sans
  // elles, « connexion interrompue » ne disait ni quelle requete avait echoue
  // ni pourquoi, et le probleme restait impossible a diagnostiquer a distance.
  const [errorDetail, setErrorDetail] = useState("");
  // L'envoi des photos et leur analyse sont deux attentes distinctes, de
  // durees et de causes differentes (reseau d'un cote, serveur de l'autre) :
  // les confondre sous un meme message empechait de savoir ce qui bloquait.
  const [phase, setPhase] = useState<"envoi" | "analyse">("envoi");

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
    const sessions: MeasureSessionApi = sessionApi ?? MeasurementsApi;
    setError("");
    setErrorDetail("");
    setPhase("envoi");
    go("analyse");
    let stage = "création de la session";
    try {
      // Le compte invite n'est cree qu'ici, au moment d'envoyer les photos :
      // un visiteur qui abandonne sur les consignes ne laisse aucune trace.
      if (guest && (await withRetry(() => ensureSession()))) await refresh();

      stage = "ouverture de la mesure";

      const session = await withRetry(() =>
        sessions.createSession({
          height_cm: Number(height),
          weight_kg: Number(weight),
          gender,
        })
      );
      stage = "envoi des photos";
      // Reessayer l'envoi est sans risque : le serveur remplace les photos
      // precedentes de la session au lieu de les accumuler.
      let current = await withRetry(() => sessions.uploadPhotos(session.id, front, side));
      setPhase("analyse");
      stage = "suivi de l'analyse";

      for (let i = 0; i < POLL_MAX && current.status === "processing"; i++) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        current = await withRetry(() => sessions.getSession(session.id));
      }

      if (current.status !== "ready" || !current.measurement_id) {
        throw new Error(
          current.error_message ||
            tr("Photos illisibles. Reprenez-les, corps entier dans le cadre.", "Photos unreadable. Retake them, whole body in frame.")
        );
      }
      onDone(current.measurement_id);
    } catch (e) {
      setError(friendlyError(e));
      // Le code HTTP d'abord : un 500 sans message n'affichait que « Error: ».
      const code = e instanceof ApiError ? ` HTTP ${e.status}` : "";
      setErrorDetail(`${stage} ·${code} ${e instanceof Error ? `${e.name}: ${e.message || "—"}` : String(e)}`);
      go("photos");
    }
  }, [front, side, height, weight, gender, guest, refresh, onDone, go, sessionApi]);

  return (
    <div className="measureFlow">
      <Steps total={4} current={STEP_INDEX[step]} />
      <ErrorBanner message={error} />
      {error && errorDetail && <p className="errorDetail">{tr("Détail", "Detail")} : {errorDetail}</p>}

      {step === "infos" && (
        <div className="flowForm">
          <h2>{tr("Taille et poids", "Height and weight")}</h2>
          <p className="muted">{tr("Indispensables pour calculer les mesures.", "Needed to calculate the measurements.")}</p>

          <div className="fieldRow" style={{ marginTop: 20 }}>
            <Field label={forClient ? tr("Taille du client (cm)", "Client's height (cm)") : tr("Votre taille (cm)", "Your height (cm)")}>
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
            <Field label={forClient ? tr("Poids du client (kg)", "Client's weight (kg)") : tr("Votre poids (kg)", "Your weight (kg)")}>
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
            label={forClient ? tr("Le client est", "The client is") : tr("Vous êtes", "You are")}
          >
            <Select value={gender} onChange={(e) => setGender(e.target.value)}>
              <option value="">{tr("Choisir…", "Choose…")}</option>
              <option value="female">{tr("Une femme", "A woman")}</option>
              <option value="male">{tr("Un homme", "A man")}</option>
            </Select>
          </Field>

          <div className="actionBar flowActions">
            <Button block disabled={!infosValid} onClick={() => go("consignes")}>
              {tr("Continuer", "Continue")}
            </Button>
          </div>
        </div>
      )}

      {step === "consignes" && (
        <>
          <h2>{tr("Avant les photos", "Before the photos")}</h2>

          <ul className="guideRules">
            <Rule
              Icon={IconModels}
              title={tr("Tenue ajustée", "Fitted clothes")}
              body={tr("Un vêtement ample fausse la mesure.", "Loose clothes distort the result.")}
            />
            <Rule
              Icon={IconPhone}
              title={tr("Téléphone posé", "Phone set down")}
              body={tr("À 2,5–3 m, à hauteur de poitrine, bien droit.", "2.5–3 m away, at chest height, upright.")}
            />
            <Rule
              Icon={IconFrame}
              title={tr("Corps entier", "Whole body")}
              body={tr("De la tête aux pieds, devant un mur dégagé.", "Head to toe, against a plain wall.")}
            />
            <Rule
              Icon={IconLight}
              title={tr("Bonne lumière", "Good light")}
              body={tr("Bien éclairé, sans contre-jour.", "Well lit, no backlight.")}
            />
          </ul>

          <div className="guidePoses">
            <Pose
              title={tr("Photo de face", "Front photo")}
              Figure={SilhouetteFace}
              points={[
                tr("Face à l'appareil", "Facing the camera"),
                tr("Bras écartés à 45°", "Arms out at 45°"),
                tr("Jambes un peu écartées", "Legs slightly apart"),
              ]}
            />
            <Pose
              title={tr("Photo de profil", "Side photo")}
              Figure={SilhouetteProfil}
              points={[
                tr("Épaule vers l'appareil", "Shoulder to the camera"),
                tr("Bras le long du corps", "Arms by your sides"),
                tr("Dos droit, jambes jointes", "Back straight, legs together"),
              ]}
            />
          </div>

          <div className="actionBar flowActions">
            <Button variant="secondary" onClick={() => go("infos")}>
              {tr("Retour", "Back")}
            </Button>
            <Button block onClick={() => go("photos")}>
              {tr("J'ai compris", "Got it")}
            </Button>
          </div>
        </>
      )}

      {step === "photos" && (
        <>
          <h2>{tr("Vos deux photos", "Your two photos")}</h2>
          <button type="button" className="guideRecall" onClick={() => go("consignes")}>
            <IconInfo size={15} aria-hidden /> {tr("Revoir les consignes", "See the instructions")}
          </button>

          <div className="photoCards">
            <PhotoPicker
              target="front"
              label={tr("Photo de face", "Front photo")}
              hint={tr("Face, bras écartés, corps entier.", "Front, arms out, whole body.")}
              file={front}
              onPick={setFront}
            />
            <PhotoPicker
              target="side"
              label={tr("Photo de profil", "Side photo")}
              hint={tr("Profil, bras le long du corps.", "Side on, arms by your sides.")}
              file={side}
              onPick={setSide}
            />
          </div>

          <div className="actionBar flowActions">
            <Button variant="secondary" onClick={() => go("consignes")}>
              {tr("Retour", "Back")}
            </Button>
            <Button block disabled={!front || !side} onClick={analyse}>
              {tr("Analyser mes photos", "Analyse my photos")}
            </Button>
          </div>
        </>
      )}

      {step === "analyse" && (
        <div className="flowAnalyse">
          <Spinner label={phase === "envoi" ? tr("Envoi des photos…", "Uploading photos…") : tr("Analyse des photos…", "Analysing photos…")} />
          <p className="muted">{tr("Moins d'une minute. Gardez la page ouverte.", "Under a minute. Keep this page open.")}</p>
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
  const [preparing, setPreparing] = useState(false);
  const [pickError, setPickError] = useState("");

  // L'URL d'apercu garde l'image en memoire tant qu'elle n'est pas revoquee.
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  async function accept(f: File) {
    // Apercu immediat sur l'original ; la version reduite, envoyee au
    // serveur, n'est transmise qu'une fois prete. Tant qu'elle ne l'est pas,
    // la photo n'est pas consideree comme choisie et l'analyse reste bloquee.
    setPreview(URL.createObjectURL(f));
    setPreparing(true);
    setPickError("");
    try {
      onPick(await compressForMeasurement(f));
    } catch (e) {
      setPreview(null);
      setPickError(photoErrorMessage(e));
    } finally {
      setPreparing(false);
    }
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
          <img src={preview} alt={label} />
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
            <span className="photoDone" aria-label={tr("Photo choisie", "Photo chosen")}>
              <IconCheck size={15} strokeWidth={3} />
            </span>
          ) : null}
        </h3>
        <p className={`fieldHint ${pickError ? "fieldHintError" : ""}`}>
          {pickError ||
            (preparing ? tr("Préparation…", "Preparing…") : file ? tr("Photo prête.", "Photo ready.") : hint)}
        </p>
      </div>

      {/* Boutons hors du bloc de texte : places sur toute la largeur de la
          carte, sous la vignette. A cote d'elle, chacun ne gardait qu'une
          centaine de pixels au telephone. */}
      <div className="photoCardActions">
        <button type="button" className="btn btnSecondary" onClick={openCamera}>
          <IconCamera size={17} aria-hidden />
          {file ? tr("Reprendre", "Retake") : tr("Prendre la photo", "Take photo")}
        </button>
        <button type="button" className="btn btnGhost" onClick={() => galleryRef.current?.click()}>
          <IconGallery size={17} aria-hidden />
          {file ? tr("Changer", "Change") : tr("Importer", "Upload")}
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
