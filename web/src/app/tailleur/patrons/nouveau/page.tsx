"use client";

/**
 * Nouveau patron a partir d'une photo (B3.7) : photo du modele (appareil ou
 * galerie, compressee), type de vetement, client du carnet (ses mesures) ou
 * mesures saisies. Envoi, attente (statut interroge toutes les 2 s), puis
 * affichage du patron.
 */

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { TailorApi, GARMENT_TYPES } from "@/lib/api/tailor";
import { compressForMeasurement } from "@/lib/imageCompress";
import { Button, ErrorBanner, PageHeader, Spinner } from "@/components/ui";
import { ClientPicker, ManualMeasureForm } from "../../_components";

const POLL_MS = 2000;
const POLL_MAX = 90;

export default function NouveauPatron() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [garment, setGarment] = useState(GARMENT_TYPES[0].code);
  const [clientId, setClientId] = useState("");
  const [manual, setManual] = useState<Record<string, number> | null>(null);
  const [showManual, setShowManual] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState(false);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    try {
      const compressed = await compressForMeasurement(file);
      setPhoto(compressed);
      if (preview) URL.revokeObjectURL(preview);
      setPreview(URL.createObjectURL(compressed));
    } catch {
      setError("Photo illisible. Essayez-en une autre.");
    }
  }

  async function submit() {
    if (!photo) return;
    setError("");
    setBusy(true);
    setWaiting(true);
    try {
      const created = await TailorApi.createPattern({
        image: photo,
        garment_type: garment,
        ...(clientId ? { tailor_client_id: clientId } : {}),
        ...(manual ? { measurements: manual } : {}),
      });
      for (let i = 0; i < POLL_MAX; i++) {
        await new Promise((r) => setTimeout(r, POLL_MS));
        const current = await TailorApi.pattern(created.id);
        if (current.status === "ready") {
          router.replace(`/tailleur/patrons/${created.id}`);
          return;
        }
        if (current.status === "failed") {
          throw new Error(current.error_message || "La génération a échoué. Réessayez avec une photo plus nette.");
        }
      }
      throw new Error("La génération prend plus de temps que prévu. Retrouvez ce patron dans l'historique.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Envoi impossible.");
      setWaiting(false);
    } finally {
      setBusy(false);
    }
  }

  if (waiting) {
    return (
      <div className="tPage">
        <PageHeader title="Génération…" />
        <Spinner label="Le patron se dessine à partir de la photo. Cela prend quelques secondes." />
        <ErrorBanner message={error} />
      </div>
    );
  }

  return (
    <div className="tPage">
      <PageHeader title="Nouveau patron" back />
      <ErrorBanner message={error} />
      <p><span className="tPreviewBadge">Aperçu — la génération à partir de l&apos;image s&apos;améliore bientôt</span></p>

      <div className="field">
        <span className="fieldLabel">1. Photo du modèle</span>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          onChange={pick}
          aria-label="Photo du modèle"
          style={{ display: "none" }}
        />
        <div className="tActionRow">
          <Button variant="secondary" onClick={() => fileRef.current?.click()}>
            Appareil photo / galerie
          </Button>
        </div>
        {preview && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Modèle photographié" style={{ marginTop: 10, maxWidth: "100%", borderRadius: 12 }} />
        )}
      </div>

      <label className="field">
        <span className="fieldLabel">2. Type de vêtement</span>
        <select className="input" value={garment} onChange={(e) => setGarment(e.target.value)}>
          {GARMENT_TYPES.map((g) => (
            <option key={g.code} value={g.code}>{g.name}</option>
          ))}
        </select>
      </label>

      <div className="field">
        <span className="fieldLabel">3. Mesures : client du carnet ou saisie libre</span>
        <ClientPicker value={clientId} onChange={(id) => { setClientId(id); setShowManual(false); }} />
        <p style={{ margin: "10px 0" }}>
          <Button variant="ghost" onClick={() => { setShowManual((s) => !s); setClientId(""); }}>
            {showManual ? "Masquer la saisie" : "Saisir les mesures sans client"}
          </Button>
        </p>
        {showManual && (
          <ManualMeasureForm
            onSubmit={async (data) => setManual(data)}
            submitLabel="Utiliser ces mesures"
          />
        )}
        {manual && !showManual && <p className="muted">Mesures saisies prises en compte.</p>}
      </div>

      <Button block onClick={submit} disabled={!photo || busy}>
        {busy ? "Envoi…" : "Générer le patron"}
      </Button>
    </div>
  );
}
