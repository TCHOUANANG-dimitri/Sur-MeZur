"use client";

/**
 * Nouveau patron (B3.7) : photo du modele, type de vetement, modele de base et
 * reglages, client du carnet (ses mesures) ou mesures saisies, puis envoi et
 * attente (statut interroge toutes les 2 s).
 *
 * Deux moteurs selon le reglage admin « Generation de patrons » :
 * - apercu : photo du modele obligatoire, patron rectangulaire indicatif ;
 * - active (GarmentCode) : le tailleur choisit un modele de base et ses
 *   reglages (longueur, manches...) ; la photo devient facultative. Les
 *   categories sans modele de base restent en apercu.
 *
 * ANALYSE DE LA PHOTO (Qwen3-VL, si le serveur l'annonce : `catalogue.vision`).
 * Le modele « voit le style » : il propose la categorie, le modele de base et
 * les reglages, et suggere des details. Rien n'est applique sans le tailleur :
 * la proposition s'affiche, il l'applique d'un clic puis corrige ; les details
 * sont des cases decochees (le modele en invente de temps en temps). Les
 * centimetres viennent toujours des mesures. L'analyse prend 1 a 3 minutes :
 * le formulaire reste utilisable pendant ce temps.
 */

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { TailorApi, GARMENT_TYPES } from "@/lib/api/tailor";
import type { PatternCatalogue, StyleAnalysis } from "@/lib/api/tailor";
import { compressForMeasurement } from "@/lib/imageCompress";
import { Button, ErrorBanner, PageHeader, Spinner } from "@/components/ui";
import { ClientPicker, ManualMeasureForm } from "../../_components";

const POLL_MS = 2000;
const POLL_MAX = 90;
/** Analyse de la photo : interrogee toutes les 4 s, abandonnee apres 6 min. */
const ANALYSE_POLL_MS = 4000;
const ANALYSE_MAX_MS = 6 * 60 * 1000;

const LIBELLES_CHOIX: Record<string, string> = {
  sans: "Sans manche", courtes: "Courtes", coude: "Au coude", trois_quarts: "Trois-quarts", longues: "Longues",
  ronde: "Ronde", v: "En V", carree: "Carrée", bateau: "Bateau",
  peu: "Peu", moyenne: "Moyenne", forte: "Forte",
};

const LIBELLES_VU: Record<string, string> = {
  length: "Longueur",
  silhouette: "Silhouette",
  waist: "Taille",
  neckline: "Encolure",
  sleeves: "Manches",
  sleeve_style: "Forme des manches",
  closure: "Fermeture",
  pockets: "Poches",
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
  // Analyse de la photo.
  const [analyse, setAnalyse] = useState<StyleAnalysis | null>(null);
  const [analysing, setAnalysing] = useState(false);
  const [analyseError, setAnalyseError] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [details, setDetails] = useState<string[]>([]);
  const [applied, setApplied] = useState(false);
  // Proposition en attente : appliquee des que les bases de la categorie sont
  // connues (changer de categorie remet sinon les reglages par defaut).
  const pending = useRef<{ base: string | null; style: Record<string, string | number> } | null>(null);
  const analyseToken = useRef(0);

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

  // Changement de categorie : premier modele de base et ses reglages par
  // defaut, ou ceux de la proposition de l'IA si elle vient d'etre appliquee.
  useEffect(() => {
    const p = pending.current;
    pending.current = null;
    const choisie = (p?.base && bases.find((b) => b.id === p.base)) || bases[0];
    setBaseId(choisie?.id ?? "");
    setStyle(choisie ? { ...choisie.style_defaut, ...(p ? filtrer(p.style, choisie.style_defaut) : {}) } : {});
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
      // Nouvelle photo : l'analyse precedente ne la concerne plus.
      analyseToken.current++;
      setAnalyse(null);
      setAnalysing(false);
      setAnalyseError("");
      setApplied(false);
      setDetails([]);
    } catch {
      setError("Photo illisible. Essayez-en une autre.");
    }
  }

  async function lancerAnalyse() {
    if (!photo) return;
    const token = ++analyseToken.current;
    setAnalyse(null);
    setAnalyseError("");
    setApplied(false);
    setDetails([]);
    setAnalysing(true);
    setElapsed(0);
    const debut = Date.now();
    const chrono = setInterval(() => setElapsed(Math.round((Date.now() - debut) / 1000)), 1000);
    try {
      let current = await TailorApi.analysePatternPhoto(photo);
      while (current.status === "processing") {
        if (Date.now() - debut > ANALYSE_MAX_MS) throw new Error("L'analyse prend trop de temps. Remplissez la fiche vous-même.");
        await new Promise((r) => setTimeout(r, ANALYSE_POLL_MS));
        if (token !== analyseToken.current) return;
        current = await TailorApi.styleAnalysis(current.id);
      }
      if (token !== analyseToken.current) return;
      if (current.status === "failed") throw new Error("L'analyse n'a pas abouti. Remplissez la fiche vous-même.");
      setAnalyse(current);
    } catch (e) {
      if (token === analyseToken.current) {
        setAnalyseError(e instanceof Error ? e.message : "L'analyse n'a pas abouti.");
      }
    } finally {
      clearInterval(chrono);
      if (token === analyseToken.current) setAnalysing(false);
    }
  }

  function appliquer() {
    const prop = analyse?.proposition;
    if (!prop?.categorie) return;
    pending.current = { base: prop.base, style: prop.style };
    if (prop.categorie === garment) {
      // Meme categorie : les bases ne changent pas, on applique tout de suite.
      const p = pending.current;
      pending.current = null;
      const choisie = (p.base && bases.find((b) => b.id === p.base)) || bases[0];
      if (choisie) {
        setBaseId(choisie.id);
        setStyle({ ...choisie.style_defaut, ...filtrer(p.style, choisie.style_defaut) });
      }
    } else {
      setGarment(prop.categorie);
    }
    setApplied(true);
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
        ...(analyse?.fiche
          ? {
              fiche: {
                source: "qwen3-vl-4b",
                proposition_appliquee: applied,
                fiche: analyse.fiche,
                details_confirmes: details,
              },
            }
          : {}),
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
  const prop = analyse?.proposition;
  const visionDispo = Boolean(catalogue?.vision);

  return (
    <div className="tPage">
      <PageHeader title="Nouveau patron" back />
      <ErrorBanner message={error} />
      {!vraiPatron && (
        <p><span className="tPreviewBadge">Aperçu — patron indicatif{aVenir ? ` (${aVenir})` : ""}</span></p>
      )}

      <div className="field">
        <span className="fieldLabel">
          1. Photo du modèle{vraiPatron ? " (facultative, gardée comme référence)" : ""}
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
            {photo ? "Changer de photo" : "Appareil photo / galerie"}
          </Button>
          {visionDispo && photo && !analysing && !analyse && (
            <Button onClick={() => void lancerAnalyse()}>Analyser la photo</Button>
          )}
        </div>
        {preview && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Modèle photographié" className="tAnalysePhoto" />
        )}
        {visionDispo && !photo && (
          <p className="fieldHint">
            Avec une photo, l&apos;IA peut proposer le type de vêtement et ses réglages : vous les vérifiez
            avant de générer.
          </p>
        )}

        {analysing && (
          <div className="banner bannerInfo tAnalyseEnCours" role="status">
            <span className="spinner tSpinnerSmall" aria-hidden />
            <span>
              Analyse de la photo… {elapsed} s. Comptez 1 à 3 minutes : vous pouvez remplir la suite
              pendant ce temps.
            </span>
          </div>
        )}
        {analyseError && <div className="banner bannerInfo">{analyseError}</div>}

        {prop && (
          <section className="card tAnalyse" aria-label="Fiche de style proposée">
            <h3 className="tAnalyseTitre">Ce que l&apos;IA a vu</h3>
            <p className="tRowSub" style={{ marginTop: 0 }}>
              {prop.categorie_label
                ? <>Type de vêtement : <strong>{prop.categorie_label}</strong></>
                : "Type de vêtement non reconnu : choisissez-le ci-dessous."}
            </p>
            {Object.keys(prop.vu).length > 0 && (
              <dl className="tAnalyseVu">
                {Object.entries(prop.vu).map(([cle, val]) => (
                  <div key={cle}>
                    <dt>{LIBELLES_VU[cle] ?? cle}</dt>
                    <dd>{val}</dd>
                  </div>
                ))}
              </dl>
            )}
            {prop.suggestions.length > 0 && (
              <fieldset className="tAnalyseDetails">
                <legend>Détails possibles, à confirmer</legend>
                {prop.suggestions.map((s) => (
                  <label key={s.code}>
                    <input
                      type="checkbox"
                      checked={details.includes(s.code)}
                      onChange={(e) =>
                        setDetails((d) => (e.target.checked ? [...d, s.code] : d.filter((x) => x !== s.code)))
                      }
                    />{" "}
                    {s.label}
                  </label>
                ))}
              </fieldset>
            )}
            {prop.pieces_assorties.length > 0 && (
              <p className="muted">Pièces assorties visibles : {prop.pieces_assorties.join(", ")}.</p>
            )}
            {prop.categorie && !applied && (
              <Button variant="secondary" onClick={appliquer}>
                Appliquer au formulaire
              </Button>
            )}
            {applied && (
              <p className="tNotice" role="status">
                Proposition appliquée : vérifiez le type, le modèle de base et les réglages ci-dessous. La
                longueur en centimètres reste à régler d&apos;après le client.
              </p>
            )}
          </section>
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

      {bases.length > 0 && (
        <div className="field">
          <label className="field">
            <span className="fieldLabel">3. Modèle de base</span>
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
        <span className="fieldLabel">{bases.length > 0 ? "4" : "3"}. Mesures : client du carnet ou saisie libre</span>
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

      <Button block onClick={submit} disabled={(!photo && !vraiPatron) || (!clientId && !manual) || busy}>
        {busy ? "Envoi…" : "Générer le patron"}
      </Button>
    </div>
  );
}

/** Ne garde de la proposition que les reglages que la base accepte. */
function filtrer(style: Record<string, string | number>, acceptes: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(style).filter(([k]) => k in acceptes));
}
