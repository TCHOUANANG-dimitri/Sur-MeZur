"use client";

// Enquete patrons : liens personnels des tailleurs (sans compte) et lecture
// des fiches qu'ils envoient depuis l'application `enquete/`.

import { useState } from "react";
import { Enquete, type EnqueteFiche } from "@/lib/api/admin";
import { Button } from "@/components/ui";
import { useFeedback } from "@/components/admin/Feedback";
import { AuthImage, ErrorState, Loading, PageHead, Panel, StatusBadge, Tabs, useLoad } from "@/components/admin/kit";
import { formatDate, formatDateTime } from "@/components/admin/format";

const LECTURE = {
  a_lire: { label: "À lire", tone: "pending" as const },
  retenu: { label: "Retenue", tone: "success" as const },
  a_completer: { label: "À compléter", tone: "pending" as const },
  ecarte: { label: "Écartée", tone: "error" as const },
};

const LIBELLES_MESURES: Record<string, string> = {
  neck: "Tour de cou", chest: "Tour de poitrine", underbust: "Sous-poitrine", waist: "Tour de taille",
  hips: "Tour de hanches", shoulder: "Carrure", back_length: "Longueur de dos", waist_hip_height: "Hauteur taille-hanches",
  garment_length: "Longueur du vêtement", sleeve_length: "Longueur de manche", biceps: "Tour de bras", wrist: "Tour de poignet",
  thigh: "Tour de cuisse", inseam: "Entrejambe", outseam: "Longueur de pantalon", ankle: "Tour de cheville",
};

type Onglet = "fiches" | "liens";

export default function EnquetePage() {
  const [onglet, setOnglet] = useState<Onglet>("fiches");
  return (
    <div className="adPage">
      <PageHead
        title="Enquête patrons"
        sub="Savoir-faire des tailleurs partenaires : leurs modèles, mesures, aisances et patrons."
        actions={<Button variant="secondary" className="adBtnSm" onClick={() => void Enquete.exportArchive()}>Exporter (ZIP)</Button>}
      />
      <Tabs<Onglet> tabs={[{ key: "fiches", label: "Fiches reçues" }, { key: "liens", label: "Liens des tailleurs" }]} value={onglet} onChange={setOnglet} />
      {onglet === "fiches" ? <Fiches /> : <Liens />}
    </div>
  );
}

/* ------------------------------------------------------------------ Fiches */

function Fiches() {
  const [statut, setStatut] = useState<"envoye" | "brouillon">("envoye");
  const [ouverte, setOuverte] = useState<string | null>(null);
  const liste = useLoad(() => Enquete.fiches({ statut }), [statut]);
  return (
    <>
      <Tabs<"envoye" | "brouillon">
        tabs={[{ key: "envoye", label: "Envoyées" }, { key: "brouillon", label: "Brouillons en cours" }]}
        value={statut}
        onChange={setStatut}
      />
      {liste.error ? <ErrorState error={liste.error} onRetry={liste.reload} /> : !liste.data ? <Loading /> : liste.data.length === 0 ? (
        <Panel title="Fiches"><p className="adHint">Aucune fiche {statut === "envoye" ? "envoyée" : "en cours"} pour l&apos;instant.</p></Panel>
      ) : (
        liste.data.map((f) => (
          <Panel
            key={f.id}
            title={<>{f.nom || "Sans nom"} <span className="adHint">· {f.categorie ?? "—"} · {f.tailleur.nom ?? f.tailleur.label}</span></>}
            actions={<>
              <StatusBadge map={LECTURE} value={f.review_status} />
              <Button variant="secondary" className="adBtnSm" onClick={() => setOuverte(ouverte === f.id ? null : f.id)}>{ouverte === f.id ? "Replier" : "Lire"}</Button>
            </>}
          >
            <p className="adHint">
              {f.source === "galerie" ? `Galerie : ${f.modele_galerie?.nom ?? "—"}` : "Modèle cousu"} · {f.nb_photos} photo(s)
              {f.tailleur.ville ? ` · ${f.tailleur.ville}` : ""} · {f.submitted_at ? `envoyée le ${formatDate(f.submitted_at)}` : `modifiée le ${formatDateTime(f.updated_at)}`}
            </p>
            {ouverte === f.id && <DetailFiche id={f.id} onChange={liste.reload} />}
          </Panel>
        ))
      )}
    </>
  );
}

function DetailFiche({ id, onChange }: { id: string; onChange: () => void }) {
  const { confirm, toast } = useFeedback();
  const fiche = useLoad(() => Enquete.fiche(id), [id]);
  if (fiche.error) return <ErrorState error={fiche.error} onRetry={fiche.reload} />;
  if (!fiche.data) return <Loading />;
  const f = fiche.data;
  const d = (f.data ?? {}) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

  const lire = async (review_status: string, rouvrir = false) => {
    let review_note: string | undefined;
    if (rouvrir) {
      const note = await confirm({
        title: "Demander un complément au tailleur ?",
        confirmLabel: "Rouvrir la fiche",
        reason: { label: "Ce qu'il doit préciser (il le verra en tête de sa fiche)", required: true },
      });
      if (note === null) return;
      review_note = note;
    }
    try {
      await Enquete.review(id, { review_status, review_note, rouvrir });
      toast(rouvrir ? "Fiche rouverte : le tailleur peut la compléter." : "Statut enregistré.");
      fiche.reload();
      onChange();
    } catch (e) {
      toast((e as Error).message, { error: true });
    }
  };

  return (
    <div className="adStack">
      {f.review_note && <p className="adWarn">Note de l&apos;équipe : {f.review_note}</p>}
      <Section titre="Tailleur" valeurs={f.tailleur.profil ?? {}} />
      <Section titre="Le modèle" valeurs={d.general ?? {}} />
      <h4>La personne</h4>
      <dl className="adMeasureGrid">
        {Object.entries(d.personne ?? {}).filter(([k]) => !["mesures", "autres_mesures"].includes(k)).map(([k, v]) => (
          <div className="adKv" key={k}><dt>{k}</dt><dd>{String(v ?? "—")}</dd></div>
        ))}
        {Object.entries((d.personne?.mesures ?? {}) as Record<string, number | null>).filter(([, v]) => v != null).map(([k, v]) => (
          <div className="adKv" key={k}>
            <dt>{LIBELLES_MESURES[k] ?? k}</dt>
            <dd>{v} cm{d.prise?.[k]?.lieu ? ` · ${d.prise[k].lieu}` : ""}{d.prise?.[k]?.precision ? ` (${d.prise[k].precision})` : ""}</dd>
          </div>
        ))}
        {((d.personne?.autres_mesures ?? []) as { nom: string; valeur: number | null }[]).map((a, i) => (
          <div className="adKv" key={`a${i}`}><dt>{a.nom}</dt><dd>{a.valeur ?? "—"} cm</dd></div>
        ))}
      </dl>
      <h4>Pièces</h4>
      <ul className="adList">
        {((d.pieces ?? []) as { nom: string; nombre: number | null; au_pli: boolean; notes?: string }[]).map((p, i) => (
          <li key={i}><strong>{p.nom}</strong> × {p.nombre ?? "?"}{p.au_pli ? " · au pli" : ""}{p.notes ? ` — ${p.notes}` : ""}</li>
        ))}
      </ul>
      <h4>Aisance (cm ajoutés : ajusté / normal / ample)</h4>
      <ul className="adList">
        {Object.entries((d.aisance ?? {}) as Record<string, { ajuste?: number; normal?: number; ample?: number }>).map(([k, a]) => (
          <li key={k}>{LIBELLES_MESURES[k] ?? k} : {a.ajuste ?? "—"} / {a.normal ?? "—"} / {a.ample ?? "—"}</li>
        ))}
      </ul>
      {d.aisance_notes && <p className="adHint">{d.aisance_notes}</p>}
      <Section titre="Marges de couture (cm)" valeurs={d.marges ?? {}} />
      <Section titre="Variantes" valeurs={d.variantes ?? {}} />
      <Section titre="Tissus" valeurs={d.tissus ?? {}} />
      <h4>Méthode de tracé</h4>
      <p className="adPre">{d.trace?.etapes || "—"}</p>
      <Section titre="Retouches et conseils" valeurs={d.retouches ?? {}} />
      <h4>Photos</h4>
      <div className="adDocGrid">
        {(f.photos ?? []).map((p) => (
          <figure key={p.id} className="adDoc">
            <AuthImage src={Enquete.photoUrl(p.url)} alt={p.kind} />
            <figcaption>{p.kind === "patron" ? "Patron" : p.kind === "vetement" ? "Vêtement" : "Autre"}{p.legende ? ` · ${p.legende}` : ""}</figcaption>
          </figure>
        ))}
      </div>
      <div className="adRow">
        <Button variant="primary" className="adBtnSm" onClick={() => void lire("retenu")}>Retenir</Button>
        {f.status === "envoye" && <Button variant="secondary" className="adBtnSm" onClick={() => void lire("a_completer", true)}>Demander un complément</Button>}
        <Button variant="danger" className="adBtnSm" onClick={() => void lire("ecarte")}>Écarter</Button>
      </div>
    </div>
  );
}

function Section({ titre, valeurs }: { titre: string; valeurs: Record<string, unknown> }) {
  const lignes = Object.entries(valeurs).filter(([, v]) => v != null && v !== "" && !(Array.isArray(v) && v.length === 0));
  if (!lignes.length) return null;
  return (
    <>
      <h4>{titre}</h4>
      <dl className="adMeasureGrid">
        {lignes.map(([k, v]) => (
          <div className="adKv" key={k}><dt>{k.replace(/_/g, " ")}</dt><dd>{Array.isArray(v) ? v.join(", ") : typeof v === "boolean" ? (v ? "oui" : "non") : String(v)}</dd></div>
        ))}
      </dl>
    </>
  );
}

/* ------------------------------------------------------------------- Liens */

function Liens() {
  const { confirm, toast } = useFeedback();
  const liens = useLoad(() => Enquete.invites(), []);
  const [label, setLabel] = useState("");
  const [note, setNote] = useState("");

  const copier = async (token: string) => {
    const url = Enquete.lien(token);
    try {
      await navigator.clipboard.writeText(url);
      toast("Lien copié : envoyez-le au tailleur (WhatsApp, SMS).");
    } catch {
      window.prompt("Copiez ce lien :", url);
    }
  };

  return (
    <>
      {!Enquete.base && (
        <p className="adWarn">
          L&apos;adresse du site du questionnaire n&apos;est pas configurée (variable NEXT_PUBLIC_ENQUETE_URL sur Vercel) :
          les liens copiés ne contiennent que le jeton.
        </p>
      )}
      <Panel title="Nouveau lien">
        <form
          className="adForm"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              const inv = await Enquete.createInvite(label.trim(), note.trim() || undefined);
              setLabel("");
              setNote("");
              liens.reload();
              await copier(inv.token);
            } catch (err) {
              toast((err as Error).message, { error: true });
            }
          }}
        >
          <label className="adFilter"><span>Tailleur (nom ou repère)</span><input className="input" value={label} onChange={(e) => setLabel(e.target.value)} required minLength={2} /></label>
          <label className="adFilter"><span>Note interne (facultatif)</span><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></label>
          <Button variant="primary" className="adBtnSm" type="submit">Créer et copier le lien</Button>
        </form>
        <p className="adHint">Un lien par tailleur : tout ce qu&apos;il remplit lui reste rattaché, et il peut revenir plus tard avec le même lien.</p>
      </Panel>

      <Panel title="Liens créés">
        {liens.error ? <ErrorState error={liens.error} onRetry={liens.reload} /> : !liens.data ? <Loading /> : liens.data.length === 0 ? (
          <p className="adHint">Aucun lien pour l&apos;instant.</p>
        ) : (
          <ul className="adList">
            {liens.data.map((i) => (
              <li key={i.id}>
                <strong>{i.label}</strong>
                {typeof i.profil.nom === "string" && i.profil.nom !== i.label ? <span className="adHint"> ({i.profil.nom})</span> : null}
                <span className="adHint"> · {i.nb_envoyes} envoyée(s), {i.nb_brouillons} en cours · {i.last_seen_at ? `vu le ${formatDateTime(i.last_seen_at)}` : "jamais ouvert"}</span>
                {i.revoked && <span className="adWarn"> · désactivé</span>}{" "}
                <button className="adLinkBtn" onClick={() => void copier(i.token)}>copier le lien</button>{" · "}
                <button
                  className="adLinkBtn"
                  onClick={async () => {
                    if ((await confirm({ title: i.revoked ? `Réactiver le lien de ${i.label} ?` : `Désactiver le lien de ${i.label} ?`, danger: !i.revoked, confirmLabel: "Appliquer" })) === null) return;
                    try {
                      await Enquete.patchInvite(i.id, { revoked: !i.revoked });
                      toast("Lien mis à jour.");
                      liens.reload();
                    } catch (e) {
                      toast((e as Error).message, { error: true });
                    }
                  }}
                >
                  {i.revoked ? "réactiver" : "désactiver"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
