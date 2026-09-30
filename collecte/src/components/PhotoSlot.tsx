"use client";

/**
 * Emplacement d'une vue photographique : vignette, consigne de posture, et
 * les deux facons de la remplir — camera dans la page (avec silhouette et
 * retardateur) ou import depuis la galerie.
 *
 * La photo est REDUITE et COPIEE EN MEMOIRE des sa selection
 * (lib/imageCompress.ts) : elle peut attendre des heures dans la file hors
 * ligne, le fichier d'origine ne doit plus etre relu.
 */

import { useEffect, useRef, useState } from "react";
import { CameraCapture, cameraSupported } from "./CameraCapture";
import { IconCamera, IconCheckCircle, IconDelete, IconGallery, IconWarning } from "./icons";
import { CollecteApi } from "@/lib/api/collecte";
import { preparePhoto, UnreadablePhotoError } from "@/lib/imageCompress";
import { VIEWS, type ViewKey } from "@/lib/protocol";

/** Image protegee : chargee avec le jeton, puis affichee par URL locale. */
export function AuthImage({
  subjectId,
  view,
  version,
  alt,
  className,
}: {
  subjectId: string;
  view: ViewKey;
  /** Change quand la photo est remplacee (empreinte sha256), pour recharger. */
  version: string;
  alt: string;
  className?: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let revoked = false;
    let objectUrl: string | null = null;
    setFailed(false);
    CollecteApi.photo(subjectId, view)
      .then((blob) => {
        if (revoked) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => !revoked && setFailed(true));
    return () => {
      revoked = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [subjectId, view, version]);

  if (failed) {
    return (
      <div className={`photoPlaceholder ${className ?? ""}`}>
        <IconWarning size={20} aria-hidden />
        <span>Indisponible</span>
      </div>
    );
  }
  if (!url) return <div className={`photoPlaceholder photoLoading ${className ?? ""}`} aria-label="Chargement" />;
  // eslint-disable-next-line @next/next/no-img-element -- URL blob locale, next/image n'apporte rien ici
  return <img src={url} alt={alt} className={className} />;
}

/** Apercu d'un Blob local (photo pas encore envoyee). */
function BlobImage({ blob, alt }: { blob: Blob; alt: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  // eslint-disable-next-line @next/next/no-img-element -- URL blob locale
  return url ? <img src={url} alt={alt} className="photoThumbImg" /> : null;
}

export function PhotoSlot({
  view,
  blob,
  remote,
  onChange,
  disabled,
}: {
  view: ViewKey;
  /** Photo choisie sur cet appareil, pas encore envoyee. */
  blob?: Blob | null;
  /** Photo deja sur le serveur (fiche existante). */
  remote?: { subjectId: string; version: string } | null;
  onChange: (blob: Blob | null) => void;
  disabled?: boolean;
}) {
  const spec = VIEWS[view];
  const [camera, setCamera] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const galleryRef = useRef<HTMLInputElement>(null);
  const captureRef = useRef<HTMLInputElement>(null);

  async function accept(file: File) {
    setError("");
    setBusy(true);
    try {
      onChange(await preparePhoto(file));
    } catch (e) {
      setError(
        e instanceof UnreadablePhotoError
          ? "Cette photo ne peut pas être lue. Reprenez-la ou choisissez-en une autre."
          : "La photo n'a pas pu être préparée."
      );
    } finally {
      setBusy(false);
    }
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Remise a zero : choisir deux fois le meme fichier doit redeclencher.
    e.target.value = "";
    if (file) void accept(file);
  }

  function takePhoto() {
    if (cameraSupported()) setCamera(true);
    else captureRef.current?.click(); // hors HTTPS : appareil photo natif
  }

  const has = !!blob || !!remote;

  return (
    <div className={`photoSlot ${has ? "photoSlotFilled" : ""}`}>
      <div className="photoThumb">
        {blob ? (
          <BlobImage blob={blob} alt={`Photo ${spec.label}`} />
        ) : remote ? (
          <AuthImage
            subjectId={remote.subjectId}
            view={view}
            version={remote.version}
            alt={`Photo ${spec.label}`}
            className="photoThumbImg"
          />
        ) : (
          <IconCamera size={26} strokeWidth={1.6} aria-hidden />
        )}
      </div>

      <div className="photoBody">
        <div className="photoTitle">
          {spec.label}
          {spec.required ? <span className="req">obligatoire</span> : <span className="opt">facultative</span>}
          {has && <IconCheckCircle size={16} className="photoOk" aria-label="Photo présente" />}
        </div>
        <p className="photoPose">{spec.pose}</p>
        {blob && remote && <p className="photoPending">Nouvelle photo, pas encore enregistrée.</p>}
        {error && (
          <p className="photoError" role="alert">
            {error}
          </p>
        )}
        <div className="photoActions">
          <button type="button" className="btn btnPrimary btnSmall" onClick={takePhoto} disabled={disabled || busy}>
            <IconCamera size={16} aria-hidden /> {has ? "Reprendre" : "Prendre"}
          </button>
          <button
            type="button"
            className="btn btnSecondary btnSmall"
            onClick={() => galleryRef.current?.click()}
            disabled={disabled || busy}
          >
            <IconGallery size={16} aria-hidden /> Importer
          </button>
          {blob && (
            <button
              type="button"
              className="btn btnGhost btnSmall"
              onClick={() => onChange(null)}
              disabled={disabled || busy}
              aria-label={`Retirer la photo ${spec.label}`}
            >
              <IconDelete size={16} aria-hidden />
            </button>
          )}
        </div>
        {busy && <p className="muted small">Préparation de la photo…</p>}
      </div>

      <input ref={galleryRef} type="file" accept="image/*" hidden onChange={onPick} />
      <input ref={captureRef} type="file" accept="image/*" capture="environment" hidden onChange={onPick} />

      {camera && (
        <CameraCapture
          silhouette={spec.silhouette}
          title={`Photo ${spec.label.toLowerCase()}`}
          hint={spec.pose}
          fileStem={view}
          onClose={() => setCamera(false)}
          onCapture={(file) => {
            setCamera(false);
            void accept(file);
          }}
        />
      )}
    </div>
  );
}
