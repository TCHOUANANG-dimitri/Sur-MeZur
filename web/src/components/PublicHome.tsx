"use client";

/**
 * Contenu de la page d'accueil publique (B1), dans la langue du telephone.
 *
 * La page (`app/page.tsx`) reste un composant serveur pour ses metadonnees ;
 * le texte vit ici, cote navigateur, pour suivre la langue (lib/i18n). Aucun
 * appel API ; `HomeRedirect` renvoie un compte inscrit vers son espace.
 */

import Link from "next/link";
import { HomeRedirect } from "./HomeRedirect";
import { SilhouetteFace, SilhouetteProfil } from "./Silhouettes";
import { IconCamera, IconCheck, IconDownload, IconMeasure, IconPhone, IconShield, IconTailor, IconUsers } from "./icons";
import { tr } from "@/lib/i18n";

export function PublicHome() {
  const trust = [
    { Icon: IconCheck, title: tr("Gratuit", "Free"), text: tr("La prise de mesure ne coûte rien.", "Measuring costs nothing.") },
    { Icon: IconCamera, title: tr("Sans mètre ruban", "No tape measure"), text: tr("Deux photos suffisent.", "Two photos are enough.") },
    { Icon: IconShield, title: tr("Photos supprimables", "Deletable photos"), text: tr("Effacez-les depuis votre profil.", "Delete them from your profile.") },
    { Icon: IconPhone, title: tr("Pensé pour le Cameroun", "Made for Cameroon"), text: tr("WhatsApp, fiche à imprimer.", "WhatsApp, printable sheet.") },
  ];
  const steps = [
    { title: tr("Vos infos", "Your details"), text: tr("Taille et poids, sans compte.", "Height and weight, no account.") },
    { title: tr("Deux photos", "Two photos"), text: tr("Face et profil, guidé par des silhouettes.", "Front and side, guided by outlines.") },
    { title: tr("Vos mesures", "Your measurements"), text: tr("12 mesures de couture, à partager.", "12 tailoring measurements, ready to share.") },
  ];
  const faqs = [
    {
      q: tr("Les mesures sont-elles précises ?", "Are the measurements accurate?"),
      a: tr(
        "Oui, avec une tenue ajustée et la bonne posture. Votre tailleur vérifie toujours avant de couper.",
        "Yes, with fitted clothes and the right posture. Your tailor always checks before cutting."
      ),
    },
    {
      q: tr("Que deviennent mes photos ?", "What happens to my photos?"),
      a: tr(
        "Elles servent seulement à calculer vos mesures, et vous pouvez les supprimer à tout moment.",
        "They're only used to calculate your measurements, and you can delete them at any time."
      ),
    },
    {
      q: tr("C'est gratuit ?", "Is it free?"),
      a: tr("Oui, pour l'instant. Tout changement sera annoncé ici.", "Yes, for now. Any change will be announced here."),
    },
    {
      q: tr("Je suis tailleur : qu'est-ce que j'y gagne ?", "I'm a tailor: what's in it for me?"),
      a: tr(
        "Un carnet de clients, la mesure par photo, le suivi des travaux et des patrons cotés.",
        "A client book, photo measuring, job tracking and measured patterns."
      ),
    },
    {
      q: tr("Faut-il installer l'application ?", "Do I need to install the app?"),
      a: tr(
        "Non, le site suffit. Sur Android, une petite application est aussi disponible.",
        "No, the website is enough. A small Android app is also available."
      ),
    },
  ];

  return (
    <div className="home">
      <HomeRedirect />

      <header className="homeHero">
        <div className="homeHeroGrid">
          <div>
            <span className="homeBadge">{tr("Gratuit", "Free")}</span>
            <h1>{tr("Vos mesures de couture en 2 photos", "Your tailoring measurements in 2 photos")}</h1>
            <p className="homeHeroSub">{tr("Sans mètre ruban, sans compte pour essayer.", "No tape measure, no account needed to try.")}</p>
            <div className="homeCtas">
              <Link href="/mesurer" className="btn homeCtaPrimary">
                {tr("Prendre mes mesures", "Take my measurements")}
              </Link>
              <Link href="#tailleurs" className="btn homeCtaSecondary">
                {tr("Je suis tailleur", "I'm a tailor")}
              </Link>
            </div>
          </div>
          <figure className="homeHeroVisual" aria-label={tr("Une photo de face, une de profil", "One front photo, one side photo")}>
            <SilhouetteFace className="" />
            <SilhouetteProfil className="" />
            <figcaption>{tr("Face et profil : 12 mesures.", "Front and side: 12 measurements.")}</figcaption>
          </figure>
        </div>
      </header>

      <section className="homeSection homeTrust" aria-label={tr("Pourquoi Sur-MeZur", "Why Sur-MeZur")}>
        <div className="homeWrap">
          <ul className="homeTrustList">
            {trust.map(({ Icon, title, text }) => (
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

      <section className="homeSection" aria-labelledby="comment-ca-marche">
        <div className="homeWrap">
          <h2 id="comment-ca-marche">{tr("Comment ça marche", "How it works")}</h2>
          <ol className="homeSteps">
            {steps.map((step, i) => (
              <li key={step.title}>
                <span className="homeStepNum" aria-hidden>{i + 1}</span>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="homeSection homeAlt" aria-labelledby="pour-qui">
        <div className="homeWrap">
          <h2 id="pour-qui">{tr("Clients et tailleurs", "Clients and tailors")}</h2>
          <div className="homePublics">
            <article className="homePublicCard">
              <span className="homeTrustIcon" aria-hidden>
                <IconMeasure size={22} />
              </span>
              <h3>{tr("Clients", "Clients")}</h3>
              <ul>
                <li>{tr("Vos mesures en 2 photos", "Your measurements in 2 photos")}</li>
                <li>{tr("Des modèles à choisir", "Styles to choose from")}</li>
                <li>{tr("Un tailleur près de chez vous", "A tailor near you")}</li>
              </ul>
              <Link href="/mesurer" className="btn btnPrimary">
                {tr("Prendre mes mesures", "Take my measurements")}
              </Link>
            </article>
            <article className="homePublicCard" id="tailleurs">
              <span className="homeTrustIcon" aria-hidden>
                <IconTailor size={22} />
              </span>
              <h3>{tr("Tailleurs", "Tailors")}</h3>
              <ul>
                <li>{tr("Carnet de clients et mesures", "Client book and measurements")}</li>
                <li>{tr("Mesure par photo à l'atelier", "Photo measuring at the workshop")}</li>
                <li>{tr("Travaux, recettes et patrons", "Jobs, income and patterns")}</li>
              </ul>
              <Link href="/inscription?role=tailleur" className="btn btnSecondary">
                {tr("Créer mon compte tailleur", "Create my tailor account")}
              </Link>
            </article>
          </div>
        </div>
      </section>

      <section className="homeSection" aria-labelledby="patron-photo">
        <div className="homeWrap">
          <h2 id="patron-photo">{tr("Des patrons cotés", "Measured patterns")}</h2>
          <p className="homeLead">
            {tr(
              "Jupe, robe, kaba, chemise, boubou… tracés aux mesures du client, à imprimer.",
              "Skirt, dress, kaba, shirt, boubou… drawn to the client's measurements, ready to print."
            )}
          </p>
          <div className="homeCtas" style={{ marginTop: 18 }}>
            <Link href="/inscription?role=tailleur" className="btn btnPrimary">
              <IconUsers size={18} aria-hidden /> {tr("Essayer", "Try it")}
            </Link>
          </div>
        </div>
      </section>

      <section className="homeSection homeAlt" aria-labelledby="faq">
        <div className="homeWrap">
          <h2 id="faq">{tr("Questions fréquentes", "FAQ")}</h2>
          <div className="homeFaq">
            {faqs.map((faq) => (
              <details key={faq.q}>
                <summary>{faq.q}</summary>
                <p>{faq.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="homeSection homeFinal" aria-labelledby="appel-final">
        <div className="homeWrap">
          <h2 id="appel-final">{tr("Vos mesures vous attendent", "Your measurements are waiting")}</h2>
          <div className="homeCtas">
            <Link href="/mesurer" className="btn homeCtaPrimary">
              <IconMeasure size={18} aria-hidden /> {tr("Prendre mes mesures", "Take my measurements")}
            </Link>
            <Link href="/telecharger" className="btn homeCtaSecondary">
              <IconDownload size={18} aria-hidden /> {tr("Télécharger l'application", "Download the app")}
            </Link>
          </div>
        </div>
      </section>

      <footer className="homeFooter">
        <nav aria-label={tr("Pied de page", "Footer")}>
          <Link href="/contact">{tr("Contact", "Contact")}</Link>
          <Link href="/infos/faq">{tr("Aide", "Help")}</Link>
          <Link href="/infos/conditions">{tr("Conditions", "Terms")}</Link>
          <Link href="/infos/confidentialite">{tr("Confidentialité", "Privacy")}</Link>
          <Link href="/telecharger">{tr("Application Android", "Android app")}</Link>
        </nav>
        <span>{tr("Sur-MeZur — fait pour le Cameroun.", "Sur-MeZur — made for Cameroon.")}</span>
      </footer>
    </div>
  );
}
