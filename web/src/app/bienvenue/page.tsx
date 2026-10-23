"use client";

/**
 * Accueil de l'application (premier ecran de l'APK et de la PWA installee).
 *
 * - Premier lancement : trois ecrans de presentation, a faire defiler du
 *   doigt ou avec « Suivant », que l'on peut passer ; puis creer un compte,
 *   se connecter ou essayer sans compte.
 * - Lancements suivants : directement l'espace de la personne si elle est
 *   connectee, sinon la page de connexion.
 *
 * Le choix « deja vu » est garde sur le telephone (localStorage). Si le
 * stockage est indisponible, on remontre simplement la presentation.
 */

import { tr } from "@/lib/i18n";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { Spinner } from "@/components/ui";
import { homeFor } from "@/lib/home";

const VU = "smz_onboarding_vu";

// Textes lus a l'affichage (accesseurs) : ils suivent la langue du telephone.
const ECRANS = [
  {
    image: "/onboarding/mesure.webp",
    get alt() { return tr("Une couturière photographie son client.", "A tailor photographs a client."); },
    get titre() { return tr("Vos mesures en 2 photos", "Your measurements in 2 photos"); },
    get texte() { return tr("Face et profil : 12 mesures de couture, sans mètre ruban.", "Front and side: 12 tailoring measurements, no tape needed."); },
  },
  {
    image: "/onboarding/tailleur.webp",
    get alt() { return tr("Un tailleur consulte son téléphone.", "A tailor checks his phone."); },
    get titre() { return tr("Tailleurs : vos clients", "Tailors: your clients"); },
    get texte() { return tr("Mesures, travaux et échéances au même endroit.", "Measurements, jobs and due dates in one place."); },
  },
  {
    image: "/onboarding/modeles.webp",
    get alt() { return tr("Une robe en pagne violet sur un mannequin.", "A purple wax-print dress on a mannequin."); },
    get titre() { return tr("Modèles et patrons", "Styles and patterns"); },
    get texte() { return tr("Choisissez un modèle, envoyez vos mesures à un tailleur.", "Pick a style, send your measurements to a tailor."); },
  },
];

function dejaVu(): boolean {
  try {
    return localStorage.getItem(VU) === "1";
  } catch {
    return false;
  }
}

function marquerVu(): void {
  try {
    localStorage.setItem(VU, "1");
  } catch {
    /* stockage indisponible : la presentation reviendra, sans gravite */
  }
}

export default function Bienvenue() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [pret, setPret] = useState(false);
  const [i, setI] = useState(0);
  const depart = useRef<number | null>(null);

  useEffect(() => {
    if (loading) return;
    if (user && !user.is_guest) {
      router.replace(homeFor(user.role));
      return;
    }
    if (dejaVu()) {
      router.replace("/connexion");
      return;
    }
    setPret(true);
  }, [loading, user, router]);

  if (!pret) return <div className="obScreen obScreenLoading"><Spinner /></div>;

  const dernier = i === ECRANS.length - 1;
  const aller = (n: number) => setI(Math.max(0, Math.min(ECRANS.length - 1, n)));
  const finir = (vers: string) => {
    marquerVu();
    router.push(vers);
  };

  return (
    <main
      className="obScreen"
      onTouchStart={(e) => { depart.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => {
        if (depart.current === null) return;
        const dx = e.changedTouches[0].clientX - depart.current;
        depart.current = null;
        if (Math.abs(dx) > 50) aller(i + (dx < 0 ? 1 : -1));
      }}
    >
      <div className="obTop">
        <Image src="/logo-mark.png" alt="Sur-MeZur" width={38} height={40} priority />
        {!dernier && (
          <button type="button" className="obSkip" onClick={() => aller(ECRANS.length - 1)}>
            {tr("Passer", "Skip")}
          </button>
        )}
      </div>

      <div className="obTrack" style={{ transform: `translateX(-${i * 100}%)` }}>
        {ECRANS.map((e, n) => (
          <section key={e.image} className="obSlide" aria-hidden={n !== i} aria-roledescription={tr("diapositive", "slide")}>
            <div className="obPhoto">
              <Image src={e.image} alt={e.alt} fill sizes="(max-width: 600px) 100vw, 480px" priority={n === 0} />
            </div>
            <h1 className="obTitle">{e.titre}</h1>
            <p className="obText">{e.texte}</p>
          </section>
        ))}
      </div>

      <div className="obBottom">
        <div className="obDots" role="tablist" aria-label={tr("Présentation", "Introduction")}>
          {ECRANS.map((e, n) => (
            <button
              key={e.image}
              type="button"
              role="tab"
              aria-selected={n === i}
              aria-label={`${n + 1}`}
              className={`obDot ${n === i ? "obDotActive" : ""}`}
              onClick={() => aller(n)}
            />
          ))}
        </div>

        {dernier ? (
          <div className="obActions">
            <button type="button" className="btn btnPrimary btnBlock" onClick={() => finir("/inscription")}>
              {tr("Créer un compte", "Create an account")}
            </button>
            <button type="button" className="btn btnSecondary btnBlock" onClick={() => finir("/connexion")}>
              {tr("J'ai déjà un compte", "I already have an account")}
            </button>
            <Link href="/mesurer" className="obTry" onClick={() => marquerVu()}>
              {tr("Essayer sans compte", "Try without an account")}
            </Link>
          </div>
        ) : (
          <div className="obActions">
            <button type="button" className="btn btnPrimary btnBlock" onClick={() => aller(i + 1)}>
              {tr("Suivant", "Next")}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
