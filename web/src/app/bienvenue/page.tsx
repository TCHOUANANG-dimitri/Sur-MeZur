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

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { Spinner } from "@/components/ui";
import { homeFor } from "@/lib/home";

const VU = "smz_onboarding_vu";

const ECRANS = [
  {
    image: "/onboarding/mesure.webp",
    alt: "Une couturière photographie son client, cadré sur une silhouette.",
    titre: "Vos mesures en 2 photos",
    texte: "Une photo de face, une de profil : Sur-MeZur calcule les 12 mesures de couture. Sans mètre ruban.",
  },
  {
    image: "/onboarding/tailleur.webp",
    alt: "Un tailleur consulte son téléphone dans son atelier.",
    titre: "Tailleurs : votre carnet de clients",
    texte: "Les mesures de chaque client, ses travaux et leurs échéances, au même endroit. Partagées en un clic sur WhatsApp.",
  },
  {
    image: "/onboarding/modeles.webp",
    alt: "Une robe en pagne violet sur un mannequin.",
    titre: "Des modèles et leurs patrons",
    texte: "Gardez les modèles qui vous plaisent, envoyez votre fiche à votre tailleur, et obtenez le patron coté du vêtement.",
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

  if (!pret) return <div className="obScreen obScreenLoading"><Spinner label="Chargement…" /></div>;

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
            Passer
          </button>
        )}
      </div>

      <div className="obTrack" style={{ transform: `translateX(-${i * 100}%)` }}>
        {ECRANS.map((e, n) => (
          <section key={e.titre} className="obSlide" aria-hidden={n !== i} aria-roledescription="diapositive">
            <div className="obPhoto">
              <Image src={e.image} alt={e.alt} fill sizes="(max-width: 600px) 100vw, 480px" priority={n === 0} />
            </div>
            <h1 className="obTitle">{e.titre}</h1>
            <p className="obText">{e.texte}</p>
          </section>
        ))}
      </div>

      <div className="obBottom">
        <div className="obDots" role="tablist" aria-label="Écrans de présentation">
          {ECRANS.map((e, n) => (
            <button
              key={e.titre}
              type="button"
              role="tab"
              aria-selected={n === i}
              aria-label={`Écran ${n + 1}`}
              className={`obDot ${n === i ? "obDotActive" : ""}`}
              onClick={() => aller(n)}
            />
          ))}
        </div>

        {dernier ? (
          <div className="obActions">
            <button type="button" className="btn btnPrimary btnBlock" onClick={() => finir("/inscription")}>
              Créer un compte
            </button>
            <button type="button" className="btn btnSecondary btnBlock" onClick={() => finir("/connexion")}>
              J&apos;ai déjà un compte
            </button>
            <Link href="/mesurer" className="obTry" onClick={() => marquerVu()}>
              Essayer sans compte
            </Link>
          </div>
        ) : (
          <div className="obActions">
            <button type="button" className="btn btnPrimary btnBlock" onClick={() => aller(i + 1)}>
              Suivant
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
