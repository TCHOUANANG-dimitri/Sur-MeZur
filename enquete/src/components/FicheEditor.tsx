"use client";

/**
 * Une fiche modele, en 8 etapes courtes. Sauvegarde automatique du brouillon
 * a chaque modification (petit delai) et a chaque changement d'etape : le
 * tailleur peut fermer la page et revenir plus tard par le meme lien.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { enquete, type Fiche, type Photo } from "@/lib/api";
import {
  CATEGORIES, DIFFICULTE, ETAPES, FOIS_COUSU, MESURES, MESURES_AISANCE, POUR, TISSUS, VARIANTES,
  manquants, normaliser, type FicheData,
} from "@/lib/questionnaire";
import { ChoixMultiple, ChoixUnique, Nombre, Photos } from "./champs";
import { aller } from "./Enquete";
import { IconBack, IconCheckCircle, IconDelete, IconNext, IconNote, IconOffline, IconPlus, IconSaved, IconSend } from "./icons";
import { Button, Card, ErrorBanner, Field, InfoBanner, Input, Spinner, Steps, Textarea } from "./ui";

type Sauvegarde = "ok" | "en_cours" | "erreur";
const SUGGESTIONS_PIECES = ["Devant", "Dos", "Manche", "Col", "Pied de col", "Ceinture", "Parementure", "Poche", "Empiècement", "Volant", "Poignet"];

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

  function changerEtape(n: number) {
    if (minuteur.current) clearTimeout(minuteur.current);
    if (data) void sauver(data);
    setEtape(n);
    window.scrollTo(0, 0);
  }

  if (erreur && !fiche) return <main className="page"><ErrorBanner message={erreur} /><Button variant="secondary" onClick={() => aller("")}>Mes fiches</Button></main>;
  if (!fiche || !data) return <main className="page"><Spinner label="Ouverture de la fiche…" /></main>;

  const parType = (k: Photo["kind"]) => photos.filter((p) => p.kind === k);
  const ajouterPhoto = (kind: Photo["kind"]) => async (f: File) => {
    const p = await api.ajouterPhoto(id, f, kind);
    setPhotos((l) => [...l, p]);
  };
  const supprimerPhoto = async (p: Photo) => {
    await api.supprimerPhoto(id, p.id);
    setPhotos((l) => l.filter((x) => x.id !== p.id));
  };

  if (envoyee) {
    return (
      <main className="page">
        <Card className="merci">
          <IconCheckCircle size={44} aria-hidden />
          <h1>Merci !</h1>
          <p>Votre fiche « {data.general.nom} » est envoyée. L&apos;équipe Sur-MeZur la lira et pourra vous recontacter si un point n&apos;est pas clair.</p>
          <Button block onClick={() => { void onChange(); aller(""); }}>Ajouter un autre modèle</Button>
        </Card>
      </main>
    );
  }

  const g = data.general;
  const pers = data.personne;
  const mesuresRemplies = MESURES.filter((m) => (pers.mesures[m.key] ?? 0) > 0);
  const manque = manquants(data, fiche.source, parType("vetement").length);

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
            {fiche.modele_galerie && (
              <Card variant="flat" className="modeleGalerie">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {fiche.modele_galerie.photo_url && <img src={fiche.modele_galerie.photo_url} alt={fiche.modele_galerie.nom} />}
                <div><span className="muted">Modèle de la galerie</span><strong>{fiche.modele_galerie.nom}</strong></div>
              </Card>
            )}
            <Card>
              <Field label="Nom du modèle *" hint="Le nom que vous lui donnez à l'atelier.">
                <Input value={g.nom ?? ""} onChange={(e) => maj((d) => ({ ...d, general: { ...d.general, nom: e.target.value } }))} />
              </Field>
              <div className="field"><span className="fieldLabel">Catégorie *</span>
                <ChoixUnique choix={CATEGORIES} value={g.categorie} onChange={(v) => maj((d) => ({ ...d, general: { ...d.general, categorie: v } }))} />
              </div>
              <div className="field"><span className="fieldLabel">Pour</span>
                <ChoixUnique choix={POUR} value={g.pour} onChange={(v) => maj((d) => ({ ...d, general: { ...d.general, pour: v } }))} />
              </div>
              <div className="field"><span className="fieldLabel">Combien de fois l&apos;avez-vous cousu ? *</span>
                <ChoixUnique choix={FOIS_COUSU} value={g.fois_cousu} onChange={(v) => maj((d) => ({ ...d, general: { ...d.general, fois_cousu: v } }))} />
              </div>
              <div className="field"><span className="fieldLabel">Difficulté</span>
                <ChoixUnique choix={DIFFICULTE} value={g.difficulte} onChange={(v) => maj((d) => ({ ...d, general: { ...d.general, difficulte: v } }))} />
              </div>
              <Field label="Temps de confection">
                <Nombre value={g.temps_heures} unite="heures" max={200} onChange={(v) => maj((d) => ({ ...d, general: { ...d.general, temps_heures: v } }))} />
              </Field>
              <Field label="Description courte" hint="Ex. : jupe droite avec fente au dos et ceinture montée.">
                <Textarea rows={3} value={g.description ?? ""} onChange={(e) => maj((d) => ({ ...d, general: { ...d.general, description: e.target.value } }))} />
              </Field>
            </Card>
            <Card>
              <Photos
                titre={fiche.source === "cousu" ? "Photos du vêtement *" : "Photos d'un vêtement que vous avez cousu (facultatif)"}
                aide="Devant, dos, et les détails (col, fermeture, poches)."
                photos={parType("vetement")}
                onAjouter={ajouterPhoto("vetement")}
                onSupprimer={supprimerPhoto}
                lectureSeule={lectureSeule}
              />
            </Card>
          </>
        )}

        {etape === 1 && (
          <>
            <Card>
              {fiche.source === "galerie" ? (
                <p className="muted">Ce modèle vient de la galerie : imaginez une personne qui le porterait et <strong>estimez ses mesures</strong>, comme vous le feriez pour une cliente type.</p>
              ) : (
                <div className="field"><span className="fieldLabel">Les mesures ci-dessous sont…</span>
                  <ChoixUnique
                    choix={[{ value: "reelles", label: "Celles d'un vrai client" }, { value: "estimees", label: "Estimées" }]}
                    value={pers.origine}
                    onChange={(v) => maj((d) => ({ ...d, personne: { ...d.personne, origine: v as "reelles" | "estimees" | undefined } }))}
                  />
                </div>
              )}
              <div className="field"><span className="fieldLabel">La personne</span>
                <ChoixUnique choix={[{ value: "femme", label: "Femme" }, { value: "homme", label: "Homme" }, { value: "enfant", label: "Enfant" }]}
                  value={pers.sexe} onChange={(v) => maj((d) => ({ ...d, personne: { ...d.personne, sexe: v } }))} />
              </div>
              <div className="fieldRow">
                <Field label="Taille"><Nombre value={pers.taille_cm} unite="cm" max={230} onChange={(v) => maj((d) => ({ ...d, personne: { ...d.personne, taille_cm: v } }))} /></Field>
                <Field label="Poids"><Nombre value={pers.poids_kg} unite="kg" max={250} onChange={(v) => maj((d) => ({ ...d, personne: { ...d.personne, poids_kg: v } }))} /></Field>
              </div>
            </Card>
            <Card>
              <p className="muted">Remplissez seulement les mesures que vous utilisez pour ce modèle (au moins 3).</p>
              <div className="grilleMesures">
                {MESURES.map((m) => (
                  <Field key={m.key} label={m.label}>
                    <Nombre value={pers.mesures[m.key]} unite="cm" ariaLabel={m.label}
                      onChange={(v) => maj((d) => ({ ...d, personne: { ...d.personne, mesures: { ...d.personne.mesures, [m.key]: v } } }))} />
                  </Field>
                ))}
              </div>
              <h3>Autres mesures que vous prenez</h3>
              {pers.autres_mesures.map((a, i) => (
                <div key={i} className="ligneEdition">
                  <Input placeholder="Nom de la mesure" value={a.nom} onChange={(e) => maj((d) => {
                    const l = [...d.personne.autres_mesures]; l[i] = { ...l[i], nom: e.target.value };
                    return { ...d, personne: { ...d.personne, autres_mesures: l } };
                  })} />
                  <Nombre value={a.valeur} unite="cm" onChange={(v) => maj((d) => {
                    const l = [...d.personne.autres_mesures]; l[i] = { ...l[i], valeur: v };
                    return { ...d, personne: { ...d.personne, autres_mesures: l } };
                  })} />
                  <button type="button" className="iconBtn" aria-label="Retirer" onClick={() => maj((d) => ({
                    ...d, personne: { ...d.personne, autres_mesures: d.personne.autres_mesures.filter((_, j) => j !== i) },
                  }))}><IconDelete size={18} aria-hidden /></button>
                </div>
              ))}
              <Button variant="ghost" type="button" onClick={() => maj((d) => ({
                ...d, personne: { ...d.personne, autres_mesures: [...d.personne.autres_mesures, { nom: "", valeur: null }] },
              }))}><IconPlus size={16} aria-hidden /> Ajouter une mesure</Button>
            </Card>
          </>
        )}

        {etape === 2 && (
          <Card>
            {mesuresRemplies.length === 0 ? (
              <p className="muted">Renseignez d&apos;abord des mesures à l&apos;étape précédente.</p>
            ) : (
              <>
                <p className="muted">Pour chaque mesure, où placez-vous le ruban ? Chaque tailleur a sa façon : c&apos;est justement ce que nous voulons connaître.</p>
                {mesuresRemplies.map((m) => {
                  const pr = data.prise[m.key] ?? {};
                  return (
                    <div key={m.key} className="field priseBloc">
                      <span className="fieldLabel">{m.label}</span>
                      {m.lieux && (
                        <ChoixUnique choix={[...m.lieux, { value: "autre", label: "Autrement" }]} value={pr.lieu}
                          onChange={(v) => maj((d) => ({ ...d, prise: { ...d.prise, [m.key]: { ...pr, lieu: v } } }))} />
                      )}
                      <Input placeholder="Précision (facultatif)" value={pr.precision ?? ""}
                        onChange={(e) => maj((d) => ({ ...d, prise: { ...d.prise, [m.key]: { ...pr, precision: e.target.value } } }))} />
                    </div>
                  );
                })}
              </>
            )}
          </Card>
        )}

        {etape === 3 && (
          <Card>
            <p className="muted">Listez les pièces que vous coupez pour ce modèle.</p>
            {data.pieces.map((p, i) => (
              <div key={i} className="piece">
                <div className="ligneEdition">
                  <Input placeholder="Nom de la pièce" value={p.nom} onChange={(e) => maj((d) => {
                    const l = [...d.pieces]; l[i] = { ...l[i], nom: e.target.value }; return { ...d, pieces: l };
                  })} />
                  <button type="button" className="iconBtn" aria-label="Retirer la pièce" onClick={() => maj((d) => ({
                    ...d, pieces: d.pieces.filter((_, j) => j !== i),
                  }))}><IconDelete size={18} aria-hidden /></button>
                </div>
                <div className="ligneEdition">
                  <Field label="Nombre à couper">
                    <Nombre value={p.nombre} max={20} onChange={(v) => maj((d) => {
                      const l = [...d.pieces]; l[i] = { ...l[i], nombre: v == null ? null : Math.round(v) }; return { ...d, pieces: l };
                    })} />
                  </Field>
                  <label className="case">
                    <input type="checkbox" checked={p.au_pli} onChange={(e) => maj((d) => {
                      const l = [...d.pieces]; l[i] = { ...l[i], au_pli: e.target.checked }; return { ...d, pieces: l };
                    })} /> Coupée au pli
                  </label>
                </div>
                <Input placeholder="Remarque (pince, fente, plis…)" value={p.notes ?? ""} onChange={(e) => maj((d) => {
                  const l = [...d.pieces]; l[i] = { ...l[i], notes: e.target.value }; return { ...d, pieces: l };
                })} />
              </div>
            ))}
            <span className="fieldLabel">Ajouter une pièce</span>
            <div className="chipRow">
              {SUGGESTIONS_PIECES.map((s) => (
                <button key={s} type="button" className="chip" onClick={() => maj((d) => ({ ...d, pieces: [...d.pieces, { nom: s, nombre: 1, au_pli: false }] }))}>+ {s}</button>
              ))}
              <button type="button" className="chip" onClick={() => maj((d) => ({ ...d, pieces: [...d.pieces, { nom: "", nombre: 1, au_pli: false }] }))}>+ Autre</button>
            </div>
          </Card>
        )}

        {etape === 4 && (
          <>
            <Card>
              <h3>Aisance</h3>
              <p className="muted">Combien de centimètres ajoutez-vous au tour du corps, selon que le client veut le vêtement <strong>ajusté</strong>, <strong>normal</strong> ou <strong>ample</strong> ? Laissez vide ce que vous ne faites pas.</p>
              <div className="tableAisance">
                <span />
                <span className="muted">Ajusté</span><span className="muted">Normal</span><span className="muted">Ample</span>
                {MESURES_AISANCE.map((k) => {
                  const lab = MESURES.find((m) => m.key === k)?.label ?? k;
                  const a = data.aisance[k] ?? {};
                  const set = (champ: "ajuste" | "normal" | "ample") => (v: number | null) =>
                    maj((d) => ({ ...d, aisance: { ...d.aisance, [k]: { ...(d.aisance[k] ?? {}), [champ]: v } } }));
                  return (
                    <div key={k} className="ligneAisance">
                      <span>{lab}</span>
                      <Nombre value={a.ajuste} unite="cm" max={60} ariaLabel={`${lab} ajusté`} onChange={set("ajuste")} />
                      <Nombre value={a.normal} unite="cm" max={60} ariaLabel={`${lab} normal`} onChange={set("normal")} />
                      <Nombre value={a.ample} unite="cm" max={80} ariaLabel={`${lab} ample`} onChange={set("ample")} />
                    </div>
                  );
                })}
              </div>
              <Field label="Remarques sur l'aisance" hint="Ex. : moins d'aisance avec un tissu extensible, plus avec du bazin.">
                <Textarea rows={2} value={data.aisance_notes ?? ""} onChange={(e) => maj((d) => ({ ...d, aisance_notes: e.target.value }))} />
              </Field>
            </Card>
            <Card>
              <h3>Marges de couture</h3>
              <div className="grilleMesures">
                <Field label="Côtés"><Nombre value={data.marges.cotes} unite="cm" max={10} onChange={(v) => maj((d) => ({ ...d, marges: { ...d.marges, cotes: v } }))} /></Field>
                <Field label="Ourlet"><Nombre value={data.marges.ourlet} unite="cm" max={15} onChange={(v) => maj((d) => ({ ...d, marges: { ...d.marges, ourlet: v } }))} /></Field>
                <Field label="Encolure / emmanchure"><Nombre value={data.marges.encolure_emmanchure} unite="cm" max={10} onChange={(v) => maj((d) => ({ ...d, marges: { ...d.marges, encolure_emmanchure: v } }))} /></Field>
                <Field label="Ceinture"><Nombre value={data.marges.ceinture} unite="cm" max={10} onChange={(v) => maj((d) => ({ ...d, marges: { ...d.marges, ceinture: v } }))} /></Field>
              </div>
              <Field label="Remarques sur les marges">
                <Input value={data.marges.notes ?? ""} onChange={(e) => maj((d) => ({ ...d, marges: { ...d.marges, notes: e.target.value } }))} />
              </Field>
            </Card>
          </>
        )}

        {etape === 5 && (
          <>
            <Card>
              <p className="muted">Quelles variantes savez-vous faire sur ce modèle ?</p>
              {VARIANTES.map((v) => (
                <div key={v.key} className="field">
                  <span className="fieldLabel">{v.label}</span>
                  <ChoixMultiple choix={v.choix} value={(data.variantes[v.key] as string[]) ?? []}
                    onChange={(l) => maj((d) => ({ ...d, variantes: { ...d.variantes, [v.key]: l } }))} />
                </div>
              ))}
              <Field label="Autres variantes">
                <Input value={data.variantes.autres ?? ""} onChange={(e) => maj((d) => ({ ...d, variantes: { ...d.variantes, autres: e.target.value } }))} />
              </Field>
            </Card>
            <Card>
              <div className="field"><span className="fieldLabel">Tissus conseillés</span>
                <ChoixMultiple choix={TISSUS} value={data.tissus.conseilles} onChange={(l) => maj((d) => ({ ...d, tissus: { ...d.tissus, conseilles: l } }))} />
              </div>
              <Field label="Métrage habituel pour la personne de l'étape 2">
                <Nombre value={data.tissus.metrage_m} unite="m" max={20} onChange={(v) => maj((d) => ({ ...d, tissus: { ...d.tissus, metrage_m: v } }))} />
              </Field>
              <Field label="Remarques sur les tissus">
                <Input value={data.tissus.notes ?? ""} onChange={(e) => maj((d) => ({ ...d, tissus: { ...d.tissus, notes: e.target.value } }))} />
              </Field>
            </Card>
          </>
        )}

        {etape === 6 && (
          <>
            <Card>
              <Photos
                titre="Photos de votre patron papier"
                aide="Le plus précieux ! Pièce par pièce, à plat, avec les cotes écrites dessus si possible."
                photos={parType("patron")}
                onAjouter={ajouterPhoto("patron")}
                onSupprimer={supprimerPhoto}
                lectureSeule={lectureSeule}
              />
            </Card>
            <Card>
              <Field label="Comment tracez-vous ce modèle ?" hint="Expliquez comme à un apprenti : par quelle pièce commencez-vous, quels calculs faites-vous (ex. « tour de hanches divisé par 4 plus 1 cm »), où placez-vous les pinces…">
                <Textarea rows={8} value={data.trace.etapes ?? ""} onChange={(e) => maj((d) => ({ ...d, trace: { ...d.trace, etapes: e.target.value } }))} />
              </Field>
              <Field label="Les retouches les plus fréquentes sur ce modèle">
                <Textarea rows={3} value={data.retouches.frequentes ?? ""} onChange={(e) => maj((d) => ({ ...d, retouches: { ...d.retouches, frequentes: e.target.value } }))} />
              </Field>
              <Field label="Vos conseils pour bien le réussir">
                <Textarea rows={3} value={data.retouches.conseils ?? ""} onChange={(e) => maj((d) => ({ ...d, retouches: { ...d.retouches, conseils: e.target.value } }))} />
              </Field>
            </Card>
            <Card>
              <Photos
                titre="Autres photos (facultatif)"
                aide="Croquis, étapes de montage, détails."
                photos={parType("autre")}
                onAjouter={ajouterPhoto("autre")}
                onSupprimer={supprimerPhoto}
                lectureSeule={lectureSeule}
              />
            </Card>
          </>
        )}
      </fieldset>

      {etape === 7 && (
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
