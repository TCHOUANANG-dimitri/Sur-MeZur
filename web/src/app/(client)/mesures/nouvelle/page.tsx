"use client";

/**
 * Prise de mesure — le parcours central de la version web.
 *
 * Trois etapes : informations, photos, analyse.
 *
 * CAPTURE DES PHOTOS. On utilise `<input type="file" capture>`, qui ouvre
 * l'appareil photo natif du telephone, et non `getUserMedia` (video en direct
 * avec silhouette guide, comme sur le mobile). Raison : `getUserMedia` exige
 * un contexte securise HTTPS, or l'API est servie en HTTP et aucun certificat
 * n'a encore ete emis pour le domaine. Le jour ou HTTPS sera en place, cette
 * seule etape pourra passer a la camera en direct sans toucher au reste.
 */

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useRef, useState } from "react";
import { MeasurementsApi } from "@/lib/api/endpoints";
import {
  Button,
  ErrorBanner,
  Field,
  InfoBanner,
  Input,
  PageHeader,
  Select,
  Spinner,
  Steps,
} from "@/components/ui";
import { IconCamera, IconCheck } from "@/components/icons";

type Step = "infos" | "photos" | "analyse";

/** L'analyse prend 10 a 90 s selon la charge du serveur : on laisse jusqu'a
 *  trois minutes avant d'abandonner, plutot que d'afficher un echec sur une
 *  mesure qui aurait abouti. */
const POLL_INTERVAL_MS = 2500;
const POLL_MAX = 72;

function NouvelleMesureInner() {
  const router = useRouter();
  const params = useSearchParams();
  const modeleId = params.get("modele");

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

  const analyse = useCallback(async () => {
    if (!front || !side) return;
    setError("");
    setStep("analyse");
    try {
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
            "Nous n'avons pas reussi a lire vos photos. Reprenez-les en vous placant bien en entier dans le cadre."
        );
      }

      router.replace(
        `/mesures/${current.measurement_id}${modeleId ? `?modele=${modeleId}` : ""}`
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "L'analyse a echoue.");
      setStep("photos");
    }
  }, [front, side, height, weight, gender, modeleId, router]);

  return (
    <>
      <PageHeader title="Prendre mes mesures" back />
      <div className="containerNarrow section">
        <Steps total={3} current={step === "infos" ? 1 : step === "photos" ? 2 : 3} />
        <ErrorBanner message={error} />

        {step === "infos" && (
          <>
            <h2>Quelques informations</h2>
            <p className="muted">
              Votre taille et votre poids servent a convertir ce que voient les photos en
              centimetres. Sans eux, aucune mesure n&apos;est possible.
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
              label="Vous etes"
              hint="Les proportions du corps different ; la mesure en tient compte."
            >
              <Select value={gender} onChange={(e) => setGender(e.target.value)}>
                <option value="">Choisir&hellip;</option>
                <option value="female">Une femme</option>
                <option value="male">Un homme</option>
              </Select>
            </Field>

            <div className="actionBar">
              <Button block disabled={!infosValid} onClick={() => setStep("photos")}>
                Continuer
              </Button>
            </div>
          </>
        )}

        {step === "photos" && (
          <>
            <h2>Deux photos</h2>
            <InfoBanner>
              <div>
                <strong>Pour un bon resultat :</strong> tenez-vous droit, bras legerement
                ecartes, devant un mur degage. Portez des vetements pres du corps &mdash; un
                vetement ample est ce qui fausse le plus les mesures.
              </div>
            </InfoBanner>

            <PhotoPicker
              label="Photo de face"
              hint="Face a l'appareil, corps entier dans le cadre, des pieds a la tete."
              file={front}
              onPick={setFront}
            />
            <PhotoPicker
              label="Photo de profil"
              hint="Tourne sur le cote, mains croisees dans le dos."
              file={side}
              onPick={setSide}
            />

            <div className="actionBar">
              <Button variant="secondary" onClick={() => setStep("infos")}>
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
            <Spinner label="Analyse de vos photos&hellip;" />
            <p className="muted" style={{ textAlign: "center" }}>
              Cela prend generalement moins d&apos;une minute. Ne fermez pas cette page.
            </p>
          </div>
        )}
      </div>
    </>
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
        <img src={preview} alt={`Apercu - ${label}`} className="photoPreview" />
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

export default function NouvelleMesure() {
  // `useSearchParams` impose une frontiere Suspense en App Router.
  return (
    <Suspense fallback={<Spinner label="Chargement&hellip;" />}>
      <NouvelleMesureInner />
    </Suspense>
  );
}
