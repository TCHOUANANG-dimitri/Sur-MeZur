"use client";

/**
 * Prise de vue dans la page, par la camera de l'appareil.
 *
 * POURQUOI PAS SEULEMENT `<input capture>`. Cet attribut n'ouvre l'appareil
 * photo que sur telephone ; sur ordinateur il est ignore et retombe sur le
 * selecteur de fichiers — la personne ne pouvait alors qu'importer. La camera
 * du navigateur (`getUserMedia`) fonctionne partout, webcam comprise.
 *
 * HTTPS. `getUserMedia` exige que la PAGE soit servie en contexte securise.
 * C'est le cas sur Vercel ; l'API peut rester en HTTP, puisque le navigateur
 * ne l'appelle jamais directement (proxy de next.config.ts). Hors contexte
 * securise — adresse locale en HTTP ouverte depuis un telephone, par exemple —
 * `cameraSupported()` renvoie faux et l'appelant retombe sur `<input capture>`.
 *
 * RETARDATEUR. Les consignes demandent de poser le telephone a 2,5–3 m : seul,
 * impossible d'appuyer sur le declencheur en etant deja en position.
 *
 * PLEIN ECRAN. L'apercu remplit tout l'ecran (`cover`), quel que soit le
 * format du flux : beaucoup de telephones livrent un flux en paysage meme
 * tenus droits, et un apercu en `contain` ne montrait alors qu'une bande au
 * milieu. Pour que ce que la personne voit soit EXACTEMENT ce qui est
 * photographie, la photo est recadree sur la partie visible de l'image
 * (`cropRef`) : aucun bord cache qui lui ferait croire etre dans le cadre.
 *
 * SILHOUETTE. La meme que dans les consignes, en surimpression sur toute la
 * hauteur de l'ecran, pour se cadrer de la tete aux pieds.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Chip } from "./ui";
import { IconClose, IconSwitchCamera, IconTimer } from "./icons";
import { SilhouetteFace, SilhouetteProfil } from "./Silhouettes";

export type CaptureTarget = "front" | "side";

/** Vrai si la camera peut etre ouverte dans la page. */
export function cameraSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    window.isSecureContext === true &&
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia
  );
}

const DELAYS = [0, 3, 10] as const;

export function CameraCapture({
  target,
  onCapture,
  onClose,
}: {
  target: CaptureTarget;
  onCapture: (file: File) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  // Rappels passes par reference : le parent les recree a chaque rendu, et
  // les mettre en dependance relancerait le retardateur ou la camera.
  const onCaptureRef = useRef(onCapture);
  const onCloseRef = useRef(onClose);
  onCaptureRef.current = onCapture;
  onCloseRef.current = onClose;

  // Camera arriere par defaut : le telephone est pose face a la personne.
  // Sur ordinateur, seule la webcam existe et `ideal` s'en accommode.
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [canSwitch, setCanSwitch] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [delay, setDelay] = useState<number>(10);
  const [count, setCount] = useState<number | null>(null);

  const stageRef = useRef<HTMLDivElement>(null);
  // Partie de l'image du flux visible a l'ecran (en pixels du flux). La video
  // est en `cover` : ce qui deborde de l'ecran est rogne a l'affichage, et la
  // photo est recadree de la meme facon au declenchement.
  const cropRef = useRef<{ sx: number; sy: number; sw: number; sh: number } | null>(null);

  const measureFrame = useCallback(() => {
    const video = videoRef.current;
    const stage = stageRef.current;
    if (!video || !stage || !video.videoWidth || !video.videoHeight || !stage.clientWidth || !stage.clientHeight) return;
    const scale = Math.max(stage.clientWidth / video.videoWidth, stage.clientHeight / video.videoHeight);
    const sw = Math.min(video.videoWidth, stage.clientWidth / scale);
    const sh = Math.min(video.videoHeight, stage.clientHeight / scale);
    cropRef.current = {
      sx: Math.round((video.videoWidth - sw) / 2),
      sy: Math.round((video.videoHeight - sh) / 2),
      sw: Math.round(sw),
      sh: Math.round(sh),
    };
  }, []);

  // Recalcul a chaque changement de taille : rotation du telephone,
  // redimensionnement de la fenetre sur ordinateur.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => measureFrame());
    observer.observe(stage);
    return () => observer.disconnect();
  }, [measureFrame]);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const close = useCallback(() => {
    stop();
    onCloseRef.current();
  }, [stop]);

  // Ouverture (et reouverture a chaque changement de camera).
  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setError("");
    stop();

    navigator.mediaDevices
      .getUserMedia({
        // Portrait d'abord (9:16) : sur un telephone tenu droit, l'image remplit
        // l'ecran et cadre la personne en pied. Valeurs « ideales » seulement :
        // une webcam de bureau, en paysage, reste acceptee.
        video: {
          facingMode: { ideal: facing },
          width: { ideal: 1080 },
          height: { ideal: 1920 },
          aspectRatio: { ideal: 9 / 16 },
        },
        audio: false,
      })
      .then(async (stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play().catch(() => {});
        }
        // La liste des cameras n'est complete qu'une fois l'autorisation
        // accordee : on ne peut savoir qu'ici s'il y a de quoi basculer.
        const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
        if (!cancelled) setCanSwitch(devices.filter((d) => d.kind === "videoinput").length > 1);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const name = e instanceof DOMException ? e.name : "";
        setError(
          name === "NotAllowedError" || name === "SecurityError"
            ? "L'accès à la caméra a été refusé. Autorisez-le dans les réglages de votre navigateur, ou importez une photo."
            : name === "NotFoundError" || name === "OverconstrainedError"
              ? "Aucune caméra n'a été détectée sur cet appareil. Importez une photo à la place."
              : "Impossible d'ouvrir la caméra. Importez une photo à la place."
        );
      });

    return () => {
      cancelled = true;
      stop();
    };
  }, [facing, stop]);

  // Echap pour fermer, et page bloquee sous la camera plein ecran.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [close]);

  const shoot = useCallback(() => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    // Image a la resolution reelle du flux, recadree sur ce qui etait visible,
    // et NON en miroir meme si l'apercu l'est : une photo de profil inversee
    // resterait mesurable, mais une photo retournee derouterait la personne a
    // la relecture. Le recadrage est centre, donc identique en miroir.
    measureFrame();
    const c = cropRef.current ?? { sx: 0, sy: 0, sw: video.videoWidth, sh: video.videoHeight };
    const canvas = document.createElement("canvas");
    canvas.width = c.sw;
    canvas.height = c.sh;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, c.sx, c.sy, c.sw, c.sh, 0, 0, c.sw, c.sh);
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setError("La photo n'a pas pu être enregistrée. Réessayez, ou importez une photo.");
          return;
        }
        const name = `${target === "front" ? "face" : "profil"}-${Date.now()}.jpg`;
        stop();
        onCaptureRef.current(new File([blob], name, { type: "image/jpeg" }));
      },
      "image/jpeg",
      0.92
    );
  }, [target, stop, measureFrame]);

  // Decompte du retardateur, une seconde a la fois.
  useEffect(() => {
    if (count === null) return;
    if (count === 0) {
      setCount(null);
      shoot();
      return;
    }
    const timer = setTimeout(() => setCount((c) => (c === null ? null : c - 1)), 1000);
    return () => clearTimeout(timer);
  }, [count, shoot]);

  function trigger() {
    if (count !== null) {
      setCount(null); // second appui : annule le retardateur
      return;
    }
    if (delay === 0) shoot();
    else setCount(delay);
  }

  const counting = count !== null;
  const title = target === "front" ? "Photo de face" : "Photo de profil";

  return (
    <div className="camera" role="dialog" aria-modal="true" aria-label={title}>
      <div className="cameraStage" ref={stageRef}>
        <video
          ref={videoRef}
          className={`cameraVideo ${facing === "user" ? "cameraMirror" : ""}`}
          playsInline
          muted
          autoPlay
          onLoadedMetadata={() => {
            setReady(true);
            measureFrame();
          }}
        />

        {!error && (
          <div className="cameraGuide" aria-hidden>
            {target === "front" ? (
              <SilhouetteFace className="cameraSilhouette" />
            ) : (
              <SilhouetteProfil className="cameraSilhouette" />
            )}
          </div>
        )}

        {counting && count > 0 && (
          <div className="cameraCount" aria-live="assertive">
            {count}
          </div>
        )}

        {error && (
          <div className="cameraError" role="alert">
            <p>{error}</p>
            <button type="button" className="btn btnPrimary" onClick={close}>
              Revenir
            </button>
          </div>
        )}
      </div>

      <div className="cameraTop">
        <span className="cameraTitle">{title}</span>
        <button type="button" className="cameraIconBtn" onClick={close} aria-label="Fermer la caméra">
          <IconClose size={22} aria-hidden />
        </button>
      </div>

      {!error && (
        <div className="cameraBottom">
          <p className="cameraHint">
            {target === "front"
              ? "Placez-vous dans la silhouette, de la tête aux pieds, bras écartés."
              : "De profil dans la silhouette, bras collés le long du corps."}
          </p>

          {/* Libelle commun devant des choix courts : « Retardateur 10 s »
              repete trois fois passait sur deux lignes au telephone. */}
          <div className="cameraDelays" role="group" aria-label="Retardateur">
            <span className="cameraDelaysLabel">
              <IconTimer size={15} aria-hidden /> Retardateur
            </span>
            {DELAYS.map((d) => (
              <Chip key={d} active={delay === d} disabled={counting} onClick={() => setDelay(d)}>
                {d === 0 ? "Aucun" : `${d} s`}
              </Chip>
            ))}
          </div>

          <div className="cameraControls">
            <span className="cameraSpacer" aria-hidden />
            <button
              type="button"
              className={`cameraShutter ${counting ? "cameraShutterCounting" : ""}`}
              onClick={trigger}
              disabled={!ready}
              aria-label={counting ? "Annuler le retardateur" : "Prendre la photo"}
            >
              <span />
            </button>
            {canSwitch ? (
              <button
                type="button"
                className="cameraIconBtn"
                onClick={() => setFacing((f) => (f === "environment" ? "user" : "environment"))}
                disabled={counting}
                aria-label="Changer de caméra"
              >
                <IconSwitchCamera size={22} aria-hidden />
              </button>
            ) : (
              <span className="cameraSpacer" aria-hidden />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
