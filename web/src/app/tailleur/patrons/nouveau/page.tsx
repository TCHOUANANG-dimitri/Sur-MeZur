"use client";

/**
 * Nouveau patron (B3.7) : type de vetement, client du carnet (ses mesures) ou
 * mesures saisies, puis envoi et attente (statut interroge toutes les 2 s).
 *
 * Deux moteurs selon le reglage admin « Generation de patrons » :
 * - apercu : photo du modele obligatoire, patron rectangulaire indicatif ;
 * - active (GarmentCode) : le tailleur choisit un modele de base et ses
 *   reglages (longueur, manches...) ; la photo devient facultative. Les
 *   categories sans modele de base restent en apercu.
 */

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { TailorApi, GARMENT_TYPES } from "@/lib/api/tailor";
import type { PatternCatalogue } from "@/lib/api/tailor";
import { compressForMeasurement } from "@/lib/imageCompress";
import { Button, ErrorBanner, PageHeader, Spinner } from "@/components/ui";
import { ClientPicker, ManualMeasureForm } from "../../_components";

const POLL_MS = 2000;
const POLL_MAX = 90;

const LIBELLES_CHOIX: Record<string, string> = {
  sans: "Sans manche", courtes: "Courtes", coude: "Au coude", trois_quarts: "Trois-quarts", longues: "Longues",
  ronde: "Ronde", v: "En V", carree: "Carrée", bateau: "Bateau",
  peu: "Peu", moyenne: "Moyenne", forte: "Forte",
};

export default function NouveauPatron() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [garment, setGarment] = useState(GARMENT_TYPES[0].code);
  const [catalogue, setCatalogue] = useState<PatternCatalogue | null>(null);
  const [baseId, setBaseId] = useState("");
  const [style, setStyle] = useState<Record<string, string | number>>({});
  const [clientId, setClientId] = useState("");
  const [manual, setManual] = useState<Record<string, number> | null>(null);
  const [showManual, setShowManual] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState(false);

  useEffect(() => {
    TailorApi.patternCatalogue().then(setCatalogue).catch(() => setCatalogue(null));
  }, []);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  const bases = useMemo(() => {
    if (!catalogue || catalogue.mode !== "on") return [];
    return catalogue.categories.find((c) => c.id === garment)?.bases ?? [];
  }, [catalogue, garment]);
  const base = bases.find((b) => b.id === baseId) ?? null;
  const vraiPatron = Boolean(base);

  // Changement de categorie : premier modele de base et ses reglages par defaut.
  useEffect(() => {
    const premier = bases[0];
    setBaseId(premier?.id ?? "");
    setStyle(premier ? { ...premier.style_defaut } : {});
  }, [bases]);

  function choisirBase(id: string) {
    setBaseId(id);
    setStyle({ ...(bases.find((b) => b.id === id)?.style_defaut ?? {}) });
  }

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
    if (!photo && !vraiPatron) return;
    setError("");
    setBusy(true);
    setWaiting(true);
    try {
      const created = await TailorApi.createPattern({
        image: photo,
        garment_type: garment,
        ...(clientId ? { tailor_client_id: clientId } : {}),
        ...(manual ? { measurements: manual } : {}),
        ...(base ? { base: base.id, style } : {}),
      });
      for (let i = 0; i < POLL_MAX; i++) {
        await new Promise((r) => setTimeout(r, POLL_MS));
        const current = await TailorApi.pattern(created.id);
        if (current.status === "ready") {
          router.replace(`/tailleur/patrons/${created.id}`);
          return;
        }
        if (current.status === "failed") {
          throw new Error(current.error_message || "La génération a échoué. Vérifiez les mesures et réessayez.");
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
        <Spinner label="Le patron se dessine à partir des mesures. Cela prend quelques secondes." />
        <ErrorBanner message={error} />
      </div>
    );
  }

  const aVenir = catalogue?.mode === "on" ? catalogue.categories.find((c) => c.id === garment)?.a_venir : null;

  return (
    <div className="tPage">
      <PageHeader title="Nouveau patron" back />
      <ErrorBanner message={error} />
      {!vraiPatron && (
        <p><span className="tPreviewBadge">Aperçu — patron indicatif{aVenir ? ` (${aVenir})` : ""}</span></p>
      )}

      <label className="field">
        <span className="fieldLabel">1. Type de vêtement</span>
        <select className="input" value={garment} onChange={(e) => setGarment(e.target.value)}>
          {GARMENT_TYPES.map((g) => (
            <option key={g.code} value={g.code}>{g.name}</option>
          ))}
        </select>
      </label>

      {bases.length > 0 && (
        <div className="field">
          <label className="field">
            <span className="fieldLabel">2. Modèle de base</span>
            <select className="input" value={baseId} onChange={(e) => choisirBase(e.target.value)}>
              {bases.map((b) => (
                <option key={b.id} value={b.id}>{b.label}{b.statut === "experimental" ? " (expérimental)" : ""}</option>
              ))}
            </select>
          </label>
          {base && <p className="muted" style={{ margin: "4px 0 10px" }}>{base.description}</p>}
          {base && catalogue && Object.keys(base.style_defaut).map((cle) => {
            const regle = catalogue.styles[cle];
            if (!regle) return null;
            const label = cle === "longueur_cm" ? `Longueur (${base.longueur_depuis}, cm)` : regle.label + (regle.unite ? ` (${regle.unite})` : "");
            return (
              <label className="field" key={cle}>
                <span className="fieldLabel">{label}</span>
                {regle.type === "choix" ? (
                  <select className="input" value={String(style[cle] ?? "")}
                          onChange={(e) => setStyle((s) => ({ ...s, [cle]: typeof regle.choix?.[0] === "number" ? Number(e.target.value) : e.target.value }))}>
                    {(regle.choix ?? []).map((c) => (
                      <option key={String(c)} value={String(c)}>{LIBELLES_CHOIX[String(c)] ?? String(c)}</option>
                    ))}
                  </select>
                ) : (
                  <input className="input" type="number" inputMode="decimal" min={0} max={200} step={0.5}
                         value={String(style[cle] ?? "")}
                         onChange={(e) => setStyle((s) => ({ ...s, [cle]: Number(e.target.value) }))} />
                )}
              </label>
            );
          })}
        </div>
      )}

      <div className="field">
        <span className="fieldLabel">{bases.length > 0 ? "3" : "2"}. Mesures : client du carnet ou saisie libre</span>
        <ClientPicker value={clientId} onChange={(id) => { setClientId(id); setShowManual(false); }} />
        <p style={{ margin: "10px 0" }}>
          <Button variant="ghost" onClick={() => { setShowManual((s) => !s); setClientId(""); }}>
            {showManual ? "Masquer la saisie" : "Saisir les mesures sans client"}
          </Button>
        </p>
        {showManual && (
          <ManualMeasureForm
            onSubmit={async (data, heightCm) => setManual({ ...data, height: heightCm })}
            submitLabel="Utiliser ces mesures"
          />
        )}
        {manual && !showManual && <p className="muted">Mesures saisies prises en compte.</p>}
      </div>

      <div className="field">
        <span className="fieldLabel">
          {bases.length > 0 ? "4" : "3"}. Photo du modèle{vraiPatron ? " (facultative, gardée comme référence)" : ""}
        </span>
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

      <Button block onClick={submit} disabled={(!photo && !vraiPatron) || (!clientId && !manual) || busy}>
        {busy ? "Envoi…" : "Générer le patron"}
      </Button>
    </div>
  );
}
