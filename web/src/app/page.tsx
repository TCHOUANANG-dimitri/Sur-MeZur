/**
 * Page d'accueil publique (B1) — orientee conversion.
 *
 * Composant SERVEUR statique : aucun appel API au chargement, aucun
 * `use client` ici (seul `HomeRedirect` est client). Visuel du bandeau
 * principal en SVG inline (silhouettes reutilisees de `Silhouettes.tsx`) :
 * aucune photo lourde a telecharger.
 *
 * Un compte deja inscrit ne reste pas ici : `HomeRedirect` le renvoie vers
 * son espace (client -> /accueil, tailleur -> /tailleur).
 */

import type { Metadata } from "next";
import Link from "next/link";
import { HomeRedirect } from "@/components/HomeRedirect";
import { SilhouetteFace, SilhouetteProfil } from "@/components/Silhouettes";
import {
  IconCamera,
  IconCheck,
  IconDownload,
  IconMeasure,
  IconPhone,
  IconShield,
  IconTailor,
  IconUsers,
} from "@/components/icons";

export const metadata: Metadata = {
  title: "Sur-MeZur — Vos mesures de couture en 2 photos, gratuitement",
  description:
    "Prenez deux photos et recevez vos 12 mensurations de couture, gratuitement. Clients : envoyez vos mesures à votre tailleur. Tailleurs : carnet de clients, mesures par photo et patrons.",
  openGraph: {
    type: "website",
    locale: "fr_FR",
    url: "https://sur-me-zur.vercel.app/",
    siteName: "Sur-MeZur",
    title: "Sur-MeZur — Vos mesures de couture en 2 photos, gratuitement",
    description:
      "Deux photos suffisent pour obtenir vos mensurations de couture. Gratuit, sans mètre ruban, pensé pour le Cameroun.",
    images: [{ url: "https://sur-me-zur.vercel.app/logo.png", width: 420, height: 630, alt: "Sur-MeZur" }],
  },
  twitter: {
    card: "summary",
    title: "Sur-MeZur — Vos mesures de couture en 2 photos, gratuitement",
    description:
      "Deux photos suffisent pour obtenir vos mensurations de couture. Gratuit, sans mètre ruban.",
    images: ["https://sur-me-zur.vercel.app/logo.png"],
  },
};

const TRUST = [
  { Icon: IconCheck, title: "Gratuit pour l'instant", text: "La prise de mesure ne coûte rien." },
  { Icon: IconCamera, title: "Sans mètre ruban", text: "Deux photos, de face et de profil, suffisent." },
  { Icon: IconShield, title: "Photos supprimables", text: "Vos photos s'effacent à tout moment depuis votre profil." },
  { Icon: IconPhone, title: "Pensé pour le Cameroun", text: "En français, partage par WhatsApp, fiche à imprimer." },
];

const STEPS = [
  { title: "Vos infos", text: "Votre taille, votre poids : 30 secondes, sans créer de compte." },
  { title: "Deux photos", text: "Une de face, une de profil, guidé par des silhouettes. Tenue ajustée, bras bien placés." },
  { title: "Vos mesures", text: "Vos 12 mensurations de couture, avec une fiche à imprimer ou à partager." },
];

const FAQS = [
  {
    q: "Quelle est la précision des mesures ?",
    a: "La photo donne de bonnes mensurations de couture quand la tenue est ajustée et la posture respectée. Votre tailleur vérifie et ajuste toujours avant de couper : c'est lui qui a le dernier mot.",
  },
  {
    q: "Que deviennent mes photos ?",
    a: "Elles servent uniquement à calculer vos mesures. Vous pouvez les supprimer à tout moment depuis votre profil, et elles ne sont ni revendues ni montrées à qui que ce soit.",
  },
  {
    q: "C'est vraiment gratuit ?",
    a: "Oui : la prise de mesure par photo et l'aperçu du patron sont gratuits pour l'instant. Certains services deviendront payants plus tard, ce sera annoncé clairement ici avant.",
  },
  {
    q: "Je suis tailleur : qu'est-ce que j'y gagne ?",
    a: "Un carnet de clients avec leurs mesures, la mesure par photo directement à l'atelier, le suivi de vos travaux avec leurs dates de livraison, et la génération de patrons à partir d'une photo.",
  },
  {
    q: "Faut-il installer l'application ?",
    a: "Non, le site suffit. Sur Android, une application légère (moins de 1 Mo) est aussi téléchargeable depuis la page Télécharger ; sur iPhone, ajoutez le site à l'écran d'accueil depuis Safari.",
  },
];

export default function Accueil() {
  return (
    <div className="home">
      <HomeRedirect />

      {/* 1. Bandeau principal */}
      <header className="homeHero">
        <div className="homeHeroGrid">
          <div>
            <span className="homeBadge">Gratuit pour l&apos;instant</span>
            <h1>Vos mesures de couture en 2 photos, gratuitement</h1>
            <p className="homeHeroSub">
              Sans mètre ruban, sans compte pour essayer : prenez une photo de face et une de
              profil, recevez vos mensurations.
            </p>
            <div className="homeCtas">
              <Link href="/mesurer" className="btn homeCtaPrimary">
                Prendre mes mesures
              </Link>
              <Link href="#tailleurs" className="btn homeCtaSecondary">
                Je suis tailleur
              </Link>
            </div>
            <p className="homeHeroNote">2 minutes, sans inscription. Le compte ne sert qu&apos;à tout conserver.</p>
          </div>
          <figure className="homeHeroVisual" aria-label="Deux photos suffisent : une de face, une de profil">
            <SilhouetteFace className="" />
            <SilhouetteProfil className="" />
            <figcaption>Une photo de face, une de profil : vos 12 mensurations.</figcaption>
          </figure>
        </div>
      </header>

      {/* 2. Bande de confiance : faits verifiables uniquement */}
      <section className="homeSection homeTrust" aria-label="Pourquoi nous faire confiance">
        <div className="homeWrap">
          <ul className="homeTrustList">
            {TRUST.map(({ Icon, title, text }) => (
              <li key={title}>
                <span className="homeTrustIcon" aria-hidden>
                  <Icon size={22} />
                </span>
                <div>
                  <strong>{title}</strong>
                  <span>{text}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* 3. Comment ca marche */}
      <section className="homeSection" aria-labelledby="comment-ca-marche">
        <div className="homeWrap">
          <span className="homeEyebrow">Simple comme une photo</span>
          <h2 id="comment-ca-marche">Comment ça marche</h2>
          <ol className="homeSteps">
            {STEPS.map((step, i) => (
              <li key={step.title}>
                <span className="homeStepNum" aria-hidden>{i + 1}</span>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* 4. Deux publics */}
      <section className="homeSection homeAlt" aria-labelledby="pour-qui">
        <div className="homeWrap">
          <span className="homeEyebrow">Pour qui</span>
          <h2 id="pour-qui">Clients et tailleurs, chacun son espace</h2>
          <div className="homePublics">
            <article className="homePublicCard">
              <span className="homeTrustIcon" aria-hidden>
                <IconMeasure size={22} />
              </span>
              <h3>Clients</h3>
              <ul>
                <li>Vos mesures en 2 photos, sans vous déplacer</li>
                <li>Des modèles à parcourir et à proposer</li>
                <li>Envoi de votre commande à votre tailleur</li>
              </ul>
              <Link href="/mesurer" className="btn btnPrimary">
                Prendre mes mesures
              </Link>
            </article>
            <article className="homePublicCard" id="tailleurs">
              <span className="homeTrustIcon" aria-hidden>
                <IconTailor size={22} />
              </span>
              <h3>Tailleurs</h3>
              <ul>
                <li>Carnet de clients avec mesures et historique</li>
                <li>Mesure par photo directement à l&apos;atelier</li>
                <li>Suivi des travaux et dates de livraison</li>
              </ul>
              <Link href="/inscription?role=tailleur" className="btn btnSecondary">
                Créer mon compte tailleur
              </Link>
            </article>
          </div>
        </div>
      </section>

      {/* 5. Patron a partir d'une photo — a venir */}
      <section className="homeSection" aria-labelledby="patron-photo">
        <div className="homeWrap">
          <span className="homeComingBadge">Bientôt · avant-première tailleurs</span>
          <h2 id="patron-photo">Patron à partir d&apos;une photo</h2>
          <p className="homeLead">
            Photographiez un modèle, recevez les pièces du patron à imprimer en A4.
            La génération à partir de l&apos;image est en version d&apos;aperçu : elle
            s&apos;améliore à chaque semaine.
          </p>
          <div className="homePatternGrid">
            <div className="homePatternSvg" role="img" aria-label="Aperçu schématique : dos, devant et manche d'un patron">
              <svg viewBox="0 0 300 190" aria-hidden>
                <g fill="none" stroke="#5b21b6" strokeWidth="2">
                  <path d="M20 20 L70 20 L78 40 L70 110 L60 170 L30 170 L20 110 L12 40 Z" />
                  <path d="M110 20 L160 20 L168 40 L160 110 L150 170 L120 170 L110 110 L102 40 Z" />
                  <path d="M195 40 L245 40 L260 120 L230 125 L215 120 L200 125 L185 120 Z" />
                </g>
                <g fill="#5b21b6" fontSize="11" fontFamily="sans-serif">
                  <text x="28" y="95">Dos</text>
                  <text x="113" y="95">Devant</text>
                  <text x="200" y="95">Manche</text>
                </g>
                <g stroke="#9ca3af" strokeDasharray="4 3">
                  <line x1="12" y1="60" x2="78" y2="60" />
                  <line x1="102" y1="60" x2="168" y2="60" />
                </g>
              </svg>
            </div>
            <div>
              <ul className="homeSteps" style={{ marginTop: 0 }}>
                <li>
                  <h3>1. Photo du modèle</h3>
                  <p>Depuis l&apos;appareil photo ou la galerie, avec le type de vêtement.</p>
                </li>
                <li>
                  <h3>2. Mesures du client</h3>
                  <p>Celles du carnet, ou saisies au mètre ruban.</p>
                </li>
                <li>
                  <h3>3. Patron imprimable</h3>
                  <p>Pièces affichées, zoomables, imprimées en tuiles A4.</p>
                </li>
              </ul>
              <div className="homeCtas" style={{ marginTop: 18 }}>
                <Link href="/inscription?role=tailleur" className="btn btnPrimary">
                  <IconUsers size={18} aria-hidden /> Essayer en avant-première
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 6. FAQ */}
      <section className="homeSection homeAlt" aria-labelledby="faq">
        <div className="homeWrap">
          <span className="homeEyebrow">Questions fréquentes</span>
          <h2 id="faq">On vous dit tout</h2>
          <div className="homeFaq">
            {FAQS.map((faq) => (
              <details key={faq.q}>
                <summary>{faq.q}</summary>
                <p>{faq.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* 7. Appel final + pied de page */}
      <section className="homeSection homeFinal" aria-labelledby="appel-final">
        <div className="homeWrap">
          <h2 id="appel-final">Vos mesures vous attendent</h2>
          <p>Gratuit, en 2 minutes, sans compte pour essayer.</p>
          <div className="homeCtas">
            <Link href="/mesurer" className="btn homeCtaPrimary">
              <IconMeasure size={18} aria-hidden /> Prendre mes mesures
            </Link>
            <Link href="/telecharger" className="btn homeCtaSecondary">
              <IconDownload size={18} aria-hidden /> Télécharger l&apos;application
            </Link>
          </div>
        </div>
      </section>

      <footer className="homeFooter">
        <nav aria-label="Pied de page">
          <Link href="/contact">Contact</Link>
          <Link href="/infos/faq">Aide</Link>
          <Link href="/infos/conditions">Conditions</Link>
          <Link href="/infos/confidentialite">Confidentialité</Link>
          <Link href="/telecharger">Télécharger l&apos;application Android</Link>
        </nav>
        <span>Sur-MeZur — fait pour le Cameroun.</span>
      </footer>
    </div>
  );
}
