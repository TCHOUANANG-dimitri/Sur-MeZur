"use client";

/**
 * Parcours complet d'un tailleur, sur une seule page :
 *   profil + accord -> liste de ses fiches -> fiche modele.
 *
 * Navigation par le fragment d'URL (#fiche=<id>, #profil) : le bouton
 * « retour » du telephone fonctionne, sans quitter le lien personnel.
 *
 * La galerie (choisir un modele de l'app et estimer les mesures d'une
 * personne) n'est plus proposee : la fiche ne demande plus de mesures de
 * personne. La route serveur reste en place.
 */

import { useCallback, useEffect, useState } from "react";
import { ApiError, enquete, type Accueil, type FicheResume, type Profil } from "@/lib/api";
import { memoriserJeton } from "@/lib/jeton";
import { CATEGORIES } from "@/lib/questionnaire";
import { Nombre } from "./champs";
import { FicheEditor } from "./FicheEditor";
import { IconCheckCircle, IconEdit, IconNote, IconPlus, IconShield } from "./icons";
import { Badge, Button, Card, EmptyState, ErrorBanner, Field, InfoBanner, Input, Spinner } from "./ui";

type Vue = { nom: "liste" } | { nom: "profil" } | { nom: "fiche"; id: string };

function lireVue(): Vue {
  const h = typeof window === "undefined" ? "" : window.location.hash.slice(1);
  if (h === "profil") return { nom: "profil" };
  if (h.startsWith("fiche=")) return { nom: "fiche", id: h.slice(6) };
  return { nom: "liste" };
}

export function aller(hash: string) {
  window.location.hash = hash;
}

export function Enquete({ token }: { token: string }) {
  const api = enquete(token);
  const [accueil, setAccueil] = useState<Accueil | null>(null);
  const [erreur, setErreur] = useState<ApiError | null>(null);
  const [vue, setVue] = useState<Vue>({ nom: "liste" });

  const charger = useCallback(async () => {
    try {
      setAccueil(await enquete(token).accueil());
      memoriserJeton(token);
      setErreur(null);
    } catch (e) {
      setErreur(e as ApiError);
    }
  }, [token]);

  useEffect(() => {
    void charger();
    setVue(lireVue());
    const onHash = () => {
      setVue(lireVue());
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [charger]);

  if (erreur && !accueil) {
    return (
      <main className="page">
        <EmptyState
          title={erreur.status === 410 ? "Lien désactivé" : erreur.status === 404 ? "Lien inconnu" : "Connexion impossible"}
          body={erreur.message}
          action={erreur.status === 0 ? <Button onClick={() => void charger()}>Réessayer</Button> : undefined}
        />
      </main>
    );
  }
  if (!accueil) return <main className="page"><Spinner label="Chargement…" /></main>;

  if (!accueil.consentement || vue.nom === "profil") {
    return (
      <ProfilForm
        accueil={accueil}
        enregistrer={async (p) => {
          await api.profil(p);
          await charger();
          aller("");
        }}
      />
    );
  }
  if (vue.nom === "fiche") {
    return <FicheEditor token={token} id={vue.id} onChange={charger} />;
  }
  return (
    <Liste
      token={token}
      accueil={accueil}
      nouvelleCousue={async () => {
        const f = await api.creer("cousu");
        await charger();
        aller(`fiche=${f.id}`);
      }}
    />
  );
}

/* ------------------------------------------------------------------ Profil */

function ProfilForm({ accueil, enregistrer }: { accueil: Accueil; enregistrer: (p: Profil) => Promise<void> }) {
  const init = accueil.profil;
  const [p, setP] = useState<Profil>({
    nom: init.nom ?? "",
    telephone: init.telephone ?? "",
    atelier: init.atelier ?? "",
    ville: init.ville ?? "",
    quartier: init.quartier ?? "",
    experience_annees: init.experience_annees ?? null,
    specialites: init.specialites ?? [],
    consentement: accueil.consentement,
  });
  const [erreur, setErreur] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const maj = (x: Partial<Profil>) => setP((v) => ({ ...v, ...x }));

  async function valider() {
    if (p.nom.trim().length < 2) return setErreur("Indiquez votre nom.");
    if (!p.consentement) return setErreur("Cochez la case d'accord pour continuer.");
    setEnvoi(true);
    setErreur("");
    try {
      await enregistrer({ ...p, nom: p.nom.trim() });
    } catch (e) {
      setErreur((e as Error).message);
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <main className="page">
      <header className="hero">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="Sur-MeZur" className="heroLogo" />
        <h1>Partagez votre savoir-faire</h1>
        <p className="muted">
          Sur-MeZur prépare un outil qui aide les tailleurs à tracer leurs patrons. Pour qu&apos;il travaille
          <strong> comme vous</strong>, nous avons besoin de savoir comment vous construisez des modèles que vous
          maîtrisez bien.
        </p>
      </header>

      {!accueil.consentement && (
        <Card variant="flat" className="consignes">
          <h2>Comment ça se passe</h2>
          <ol>
            <li>Vous choisissez un modèle <strong>simple</strong> que vous <strong>cousez souvent</strong> (jupe droite, kaba…).</li>
            <li>Vous dites combien de centimètres vous ajoutez aux mesures, et comment vous le coupez : surtout des choix à toucher.</li>
            <li>Pas de patron à fournir, pas de mesures de client à donner.</li>
          </ol>
          <p className="muted">Environ 5 minutes par modèle. Tout est enregistré au fur et à mesure : vous pouvez vous arrêter et revenir plus tard avec le même lien.</p>
        </Card>
      )}

      <Card>
        <h2>Vous</h2>
        <Field label="Votre nom *"><Input value={p.nom} onChange={(e) => maj({ nom: e.target.value })} autoComplete="name" /></Field>
        <Field label="Téléphone (WhatsApp)" hint="Pour vous recontacter si une réponse n'est pas claire.">
          <Input type="tel" inputMode="tel" value={p.telephone ?? ""} onChange={(e) => maj({ telephone: e.target.value })} />
        </Field>
        <div className="fieldRow">
          <Field label="Ville"><Input value={p.ville ?? ""} onChange={(e) => maj({ ville: e.target.value })} /></Field>
          <Field label="Années d'expérience">
            <Nombre value={p.experience_annees} onChange={(v) => maj({ experience_annees: v == null ? null : Math.round(v) })} unite="ans" max={80} />
          </Field>
        </div>
      </Card>

      <Card variant="flat">
        <label className="accord">
          <input type="checkbox" checked={p.consentement} onChange={(e) => maj({ consentement: e.target.checked })} />
          <span>
            <IconShield size={16} aria-hidden /> J&apos;accepte que Sur-MeZur utilise mes réponses et mes éventuelles photos pour
            concevoir son outil de patrons. Mes coordonnées ne seront pas publiées. Je peux demander leur suppression
            à tout moment.
          </span>
        </label>
      </Card>

      <ErrorBanner message={erreur} />
      <div className="actions">
        <Button block onClick={() => void valider()} disabled={envoi}>
          {envoi ? "Enregistrement…" : accueil.consentement ? "Enregistrer" : "Commencer"}
        </Button>
      </div>
    </main>
  );
}

/* ------------------------------------------------------------------- Liste */

function Liste({ token, accueil, nouvelleCousue }: { token: string; accueil: Accueil; nouvelleCousue: () => Promise<void> }) {
  const [occupe, setOccupe] = useState(false);
  const [copie, setCopie] = useState(false);
  const lienPerso = typeof window === "undefined" ? "" : `${window.location.origin}/${token}`;
  const [erreur, setErreur] = useState("");
  const envoyees = accueil.modeles.filter((m) => m.status === "envoye").length;

  async function creer() {
    setOccupe(true);
    try {
      await nouvelleCousue();
    } catch (e) {
      setErreur((e as Error).message);
    } finally {
      setOccupe(false);
    }
  }

  return (
    <main className="page">
      <header className="barre">
        <div>
          <p className="muted">Bonjour</p>
          <h1>{accueil.profil.nom}</h1>
        </div>
        <button className="lien" onClick={() => aller("profil")}><IconEdit size={16} aria-hidden /> Mon profil</button>
      </header>

      {envoyees > 0 && (
        <InfoBanner>
          <IconCheckCircle size={16} aria-hidden /> Merci ! {envoyees} fiche{envoyees > 1 ? "s" : ""} envoyée{envoyees > 1 ? "s" : ""}. Vous pouvez en ajouter d&apos;autres.
        </InfoBanner>
      )}

      <Card variant="flat" className="consignes">
        <strong>Ajouter un modèle</strong>
        <p className="muted">Un modèle <strong>simple</strong> que vous <strong>cousez souvent</strong>. Environ 5 minutes.</p>
        <Button block onClick={() => void creer()} disabled={occupe}>
          <IconPlus size={18} aria-hidden /> {occupe ? "Ouverture…" : "Ajouter un modèle"}
        </Button>
        <ErrorBanner message={erreur} />
      </Card>

      <h2 className="sectionTitre">Mes fiches</h2>
      {accueil.modeles.length === 0 ? (
        <EmptyState title="Aucune fiche pour l'instant" body="Ajoutez un premier modèle ci-dessus." />
      ) : (
        <div className="liste">
          {[...accueil.modeles].reverse().map((m) => <LigneFiche key={m.id} m={m} />)}
        </div>
      )}

      <Card variant="flat" className="lienPerso">
        <strong>Votre lien personnel</strong>
        <p className="muted">Sur ce téléphone, vos fiches sont retrouvées automatiquement. Pour continuer sur un autre appareil, gardez ce lien (envoyez-le-vous sur WhatsApp par exemple).</p>
        <code>{lienPerso}</code>
        <Button variant="secondary" onClick={async () => {
          try {
            await navigator.clipboard.writeText(lienPerso);
            setCopie(true);
          } catch {
            window.prompt("Copiez votre lien :", lienPerso);
          }
        }}>{copie ? "Lien copié" : "Copier mon lien"}</Button>
      </Card>
    </main>
  );
}

function LigneFiche({ m }: { m: FicheResume }) {
  return (
    <button className="ligne" onClick={() => aller(`fiche=${m.id}`)}>
      <div className="ligneTexte">
        <strong>{m.nom || "Modèle à compléter"}</strong>
        <span className="muted">
          {CATEGORIES.find((c) => c.value === m.categorie)?.label ?? "Catégorie à choisir"}
          {m.nb_photos ? ` · ${m.nb_photos} photo${m.nb_photos > 1 ? "s" : ""}` : ""}
        </span>
        {m.a_completer && (
          <span className="aCompleter"><IconNote size={14} aria-hidden /> L&apos;équipe vous demande un complément</span>
        )}
      </div>
      {m.status === "envoye" ? <Badge tone="success">Envoyée</Badge> : <Badge tone="pending">Brouillon</Badge>}
    </button>
  );
}
