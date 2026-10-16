"use client";

/**
 * Une fiche modele en 3 etapes courtes + envoi (environ 5 minutes) : le
 * modele, l'aisance, la coupe. Presque tout se fait en touchant des choix.
 * Sauvegarde automatique du brouillon a chaque modification (petit delai) et
 * a chaque changement d'etape : le tailleur peut fermer la page et revenir
 * plus tard par le meme lien.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { enquete, type Fiche, type Photo } from "@/lib/api";
import {
  AISANCE_PAR_CATEGORIE, CATEGORIES, ETAPES, FOIS_COUSU, LIBELLES_MESURES, MESURES_PAR_CATEGORIE, POUR,
  TAILLE_OU, TYPES, TYPES_EVASES, manquants, normaliser, questionsCoupe, type FicheData,
} from "@/lib/questionnaire";
import { ChoixMultiple, ChoixUnique, Nombre, Photos } from "./champs";
import { aller } from "./Enquete";
import { IconBack, IconCheckCircle, IconDelete, IconNext, IconNote, IconOffline, IconSaved, IconSend } from "./icons";
import { Button, Card, ErrorBanner, Field, InfoBanner, Input, Spinner, Steps, Textarea } from "./ui";

type Sauvegarde = "ok" | "en_cours" | "erreur";
const AVEC_TAILLE = ["jupe", "robe", "haut", "pantalon", "chemise", "autre"];

export function FicheEditor({ token, id, onChange }: { token: string; id: string; onChange: () => Promise<void> }) {
  const api = enquete(token);
  const [fiche, setFiche] = useState<Fiche | null>(null);
  const [data, setData] = useState<FicheData | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [etape, setEtape] = useState(0);
  const [sauvegarde, setSauvegarde] = useState<Sauvegarde>("ok");
  const [erreur, setErreur] = useState("");
  const [envoyee, setEnvoyee] = useState(false);
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aSauver = useRef(false);

  useEffect(() => {
    enquete(token).lire(id).then((f) => {
      setFiche(f);
      setData(normaliser(f.data));
      setPhotos(f.photos);
    }).catch((e) => setErreur((e as Error).message));
  }, [token, id]);

  const lectureSeule = fiche?.status === "envoye";

  const sauver = useCallback(async (d: FicheData) => {
    if (!aSauver.current) return;
    aSauver.current = false;
    setSauvegarde("en_cours");
    try {
      await enquete(token).sauver(id, d);
      setSauvegarde("ok");
    } catch {
      aSauver.current = true;
      setSauvegarde("erreur");
    }
  }, [token, id]);

  // Reseau mobile instable : une sauvegarde ratee est retentee toute seule.
  useEffect(() => {
    if (sauvegarde !== "erreur" || !data) return;
    const t = setTimeout(() => void sauver(data), 5000);
    return () => clearTimeout(t);
  }, [sauvegarde, data, sauver]);

  function maj(f: (d: FicheData) => FicheData) {
    if (lectureSeule) return;
    setData((d) => {
      if (!d) return d;
      const n = f(d);
      aSauver.current = true;
      if (minuteur.current) clearTimeout(minuteur.current);
      minuteur.current = setTimeout(() => void sauver(n), 1200);
      return n;
    });
  }
  const majGeneral = (x: Partial<FicheData["general"]>) => maj((d) => ({ ...d, general: { ...d.general, ...x } }));
  const majCoupe = (x: Partial<FicheData["coupe"]>) => maj((d) => ({ ...d, coupe: { ...d.coupe, ...x } }));

  function changerEtape(n: number) {
    if (minuteur.current) clearTimeout(minuteur.current);
    if (data) void sauver(data);
    setEtape(n);
    window.scrollTo(0, 0);
  }

  if (erreur && !fiche) return <main className="page"><ErrorBanner message={erreur} /><Button variant="secondary" onClick={() => aller("")}>Mes fiches</Button></main>;
  if (!fiche || !data) return <main className="page"><Spinner label="Ouverture de la fiche…" /></main>;

  const vetements = photos.filter((p) => p.kind === "vetement");
  const ajouterPhoto = async (f: File) => {
    const p = await api.ajouterPhoto(id, f, "vetement");
    setPhotos((l) => [...l, p]);
  };
  const supprimerPhoto = async (p: Photo) => {
    await api.supprimerPhoto(id, p.id);
    setPhotos((l) => l.filter((x) => x.id !== p.id));
  };

  const g = data.general;
  const nomAffiche = g.type && g.type !== "autre" ? g.type_label : g.nom;

  if (envoyee) {
    return (
      <main className="page">
        <Card className="merci">
          <IconCheckCircle size={44} aria-hidden />
          <h1>Merci !</h1>
          <p>Votre fiche « {nomAffiche || "modèle"} » est envoyée. L&apos;équipe Sur-MeZur la lira et pourra vous recontacter si un point n&apos;est pas clair.</p>
          <Button block onClick={() => { void onChange(); aller(""); }}>Ajouter un autre modèle</Button>
        </Card>
      </main>
    );
  }

  const cat = g.categorie;
  const types = cat ? TYPES[cat] ?? [] : [];
  const mesuresProposees = cat ? MESURES_PAR_CATEGORIE[cat] ?? [] : [];
  const aisances = cat ? AISANCE_PAR_CATEGORIE[cat] ?? [] : [];
  const questions = questionsCoupe(cat, g.type);
  const manque = manquants(data);

  return (
    <main className="page">
      <header className="barre">
        <button className="lien" onClick={() => { if (data) void sauver(data); void onChange(); aller(""); }}>← Mes fiches</button>
        <EtatSauvegarde etat={lectureSeule ? "ok" : sauvegarde} lectureSeule={lectureSeule} />
      </header>

      <Steps total={ETAPES.length} current={etape + 1} />
      <p className="muted etapeNum">Étape {etape + 1} sur {ETAPES.length}</p>
      <h1>{ETAPES[etape].titre}</h1>

      {fiche.a_completer && fiche.review_note && (
        <div className="noteEquipe"><IconNote size={18} aria-hidden /><div><strong>Message de l&apos;équipe</strong><p>{fiche.review_note}</p></div></div>
      )}
      {lectureSeule && <InfoBanner>Fiche envoyée : elle n&apos;est plus modifiable.</InfoBanner>}

      <fieldset disabled={lectureSeule} className="etape">
        {etape === 0 && (
          <>
            <Card>
              <div className="field"><span className="fieldLabel">Quel vêtement ? *</span>
                <ChoixUnique choix={CATEGORIES} value={cat}
                  onChange={(v) => majGeneral({ categorie: v, type: undefined, type_label: undefined })} />
              </div>
              {cat && (
                <div className="field"><span className="fieldLabel">Quel modèle exactement ? *</span>
                  <ChoixUnique choix={types} value={g.type}
                    onChange={(v) => majGeneral({ type: v, type_label: types.find((t) => t.value === v)?.label })} />
                </div>
              )}
              {g.type === "autre" && (
                <Field label="Son nom à l'atelier *" hint="Ex. : robe sirène, jupe portefeuille…">
                  <Input value={g.nom ?? ""} onChange={(e) => majGeneral({ nom: e.target.value })} />
                </Field>
              )}
              <div className="field"><span className="fieldLabel">Pour</span>
                <ChoixUnique choix={POUR} value={g.pour} onChange={(v) => majGeneral({ pour: v })} />
              </div>
              <div className="field"><span className="fieldLabel">Combien de fois l&apos;avez-vous cousu ? *</span>
                <ChoixUnique choix={FOIS_COUSU} value={g.fois_cousu} onChange={(v) => majGeneral({ fois_cousu: v })} />
              </div>
            </Card>
            <Card>
              <Photos
                titre="Une photo du vêtement (facultatif)"
                aide="Un vêtement de ce modèle que vous avez cousu, porté ou à plat. Pas besoin de patron."
                photos={vetements}
                onAjouter={ajouterPhoto}
                onSupprimer={supprimerPhoto}
                lectureSeule={lectureSeule}
              />
            </Card>
          </>
        )}

        {etape === 1 && (
          !cat ? (
            <Card><p className="muted">Choisissez d&apos;abord le vêtement à l&apos;étape 1.</p></Card>
          ) : (
            <>
              <Card>
                <h2>L&apos;aisance *</h2>
                <p className="muted">
                  Pour ce modèle porté normalement, combien de <strong>centimètres ajoutez-vous</strong> au tour que
                  vous avez mesuré ? Mettez 0 si vous n&apos;ajoutez rien, laissez vide si vous ne savez pas.
                </p>
                <div className="grilleMesures">
                  {aisances.map((k) => (
                    <Field key={k} label={`${LIBELLES_MESURES[k]} +`}>
                      <Nombre value={data.aisance_cm[k]} unite="cm" max={80} ariaLabel={`Aisance ${LIBELLES_MESURES[k]}`}
                        onChange={(v) => maj((d) => ({ ...d, aisance_cm: { ...d.aisance_cm, [k]: v } }))} />
                    </Field>
                  ))}
                </div>
              </Card>
              <Card>
                <div className="field"><span className="fieldLabel">Les mesures que vous prenez pour ce modèle</span>
                  <ChoixMultiple choix={mesuresProposees.map((k) => LIBELLES_MESURES[k])}
                    value={data.mesures_prises.map((k) => LIBELLES_MESURES[k] ?? k)}
                    onChange={(l) => maj((d) => ({
                      ...d, mesures_prises: l.map((lab) => Object.keys(LIBELLES_MESURES).find((k) => LIBELLES_MESURES[k] === lab) ?? lab),
                    }))} />
                </div>
                {AVEC_TAILLE.includes(cat) && (
                  <div className="field"><span className="fieldLabel">Où placez-vous le ruban pour le tour de taille ?</span>
                    <ChoixUnique choix={TAILLE_OU} value={data.taille_ou} onChange={(v) => maj((d) => ({ ...d, taille_ou: v }))} />
                  </div>
                )}
              </Card>
            </>
          )
        )}

        {etape === 2 && (
          <>
            <Card>
              <div className="fieldRow">
                <Field label="Valeur de couture *" hint="Ce que vous laissez sur les côtés.">
                  <Nombre value={data.coupe.couture_cm} unite="cm" max={10} ariaLabel="Valeur de couture"
                    onChange={(v) => majCoupe({ couture_cm: v })} />
                </Field>
                <Field label="Ourlet" hint="Ce que vous laissez en bas.">
                  <Nombre value={data.coupe.ourlet_cm} unite="cm" max={20} ariaLabel="Ourlet" onChange={(v) => majCoupe({ ourlet_cm: v })} />
                </Field>
              </div>
              {g.type && TYPES_EVASES.includes(g.type) && (
                <Field label="Évasement" hint="Combien de cm ajoutez-vous en bas, de chaque côté, par rapport aux hanches (ou à la poitrine) ?">
                  <Nombre value={data.coupe.evasement_cm} unite="cm" max={80} ariaLabel="Évasement" onChange={(v) => majCoupe({ evasement_cm: v })} />
                </Field>
              )}
            </Card>
            {questions.length > 0 && (
              <Card>
                {questions.map((q) => (
                  <div key={q.cle} className="field"><span className="fieldLabel">{q.label}</span>
                    <ChoixUnique choix={q.choix} value={data.coupe[q.cle] as string | undefined}
                      onChange={(v) => majCoupe({ [q.cle]: v })} />
                  </div>
                ))}
              </Card>
            )}
            <Card>
              <Field label="Vos calculs ou astuces de traçage (facultatif)"
                hint="Ex. : « devant = tour de hanches ÷ 4 + 1 cm », « je descends la pince de 12 cm », « avec le bazin j'ajoute 2 cm ».">
                <Textarea rows={4} value={data.astuces ?? ""} onChange={(e) => maj((d) => ({ ...d, astuces: e.target.value }))} />
              </Field>
            </Card>
          </>
        )}
      </fieldset>

      {etape === 3 && (
        <Card>
          {lectureSeule ? (
            <p>Cette fiche a été envoyée{fiche.submitted_at ? ` le ${new Date(fiche.submitted_at).toLocaleDateString("fr-FR")}` : ""}. Merci !</p>
          ) : manque.length ? (
            <>
              <p><strong>Il manque encore :</strong></p>
              <ul className="manques">{manque.map((m) => <li key={m}>{m}</li>)}</ul>
              <p className="muted">Le reste est facultatif, mais chaque réponse nous aide.</p>
            </>
          ) : (
            <p>Tout l&apos;essentiel est rempli. Relisez si vous le souhaitez, puis envoyez.</p>
          )}
          <ErrorBanner message={erreur} />
          {!lectureSeule && (
            <div className="actionsColonne">
              <Button block disabled={manque.length > 0} onClick={async () => {
                setErreur("");
                try {
                  if (data) { aSauver.current = true; await sauver(data); }
                  await api.envoyer(id);
                  setEnvoyee(true);
                } catch (e) {
                  setErreur((e as Error).message);
                }
              }}><IconSend size={16} aria-hidden /> Envoyer la fiche</Button>
              <Button variant="ghost" block onClick={async () => {
                if (!window.confirm("Supprimer ce brouillon ? Ses photos seront effacées.")) return;
                try {
                  await api.supprimer(id);
                  await onChange();
                  aller("");
                } catch (e) {
                  setErreur((e as Error).message);
                }
              }}><IconDelete size={16} aria-hidden /> Supprimer le brouillon</Button>
            </div>
          )}
        </Card>
      )}

      <nav className="navEtapes">
        <Button variant="secondary" disabled={etape === 0} onClick={() => changerEtape(etape - 1)}><IconBack size={16} aria-hidden /> Précédent</Button>
        {etape < ETAPES.length - 1 && (
          <Button onClick={() => changerEtape(etape + 1)}>Suivant <IconNext size={16} aria-hidden /></Button>
        )}
      </nav>
    </main>
  );
}

function EtatSauvegarde({ etat, lectureSeule }: { etat: Sauvegarde; lectureSeule: boolean }) {
  if (lectureSeule) return <span className="etatSauvegarde">Envoyée</span>;
  if (etat === "en_cours") return <span className="etatSauvegarde">Enregistrement…</span>;
  if (etat === "erreur") return <span className="etatSauvegarde etatErreur"><IconOffline size={14} aria-hidden /> Non enregistré, nouvelle tentative…</span>;
  return <span className="etatSauvegarde"><IconSaved size={14} aria-hidden /> Enregistré</span>;
}
