"use client";

/**
 * Point d'entree du site.
 *
 * Deux publics arrivent ici : un visiteur qui decouvre le service, et un
 * client deja inscrit qui revient. On ne peut pas trancher cote serveur
 * puisque la session vit dans `localStorage` — d'ou la redirection cote
 * client une fois la session connue, et une page d'accueil reelle (et non un
 * ecran de chargement vide) pendant ce temps.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/components/AuthProvider";
import { Button } from "@/components/ui";

export default function Landing() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading || !user) return;
    router.replace(user.role === "admin" ? "/admin" : "/accueil");
  }, [loading, user, router]);

  return (
    <main className="landing">
      <section className="landingHero">
        <div className="containerNarrow">
          <span className="brandMark" aria-hidden>
            S
          </span>
          <h1>
            Vos mesures de couture,
            <br />
            sans mètre ruban.
          </h1>
          <p className="landingLead">
            Choisissez un modèle, prenez deux photos, et repartez avec une fiche de mesures
            prête à donner à votre tailleur.
          </p>
          <div className="landingActions">
            <Link href="/inscription" style={{ display: "contents" }}>
              <Button block>Commencer</Button>
            </Link>
            <Link href="/connexion" style={{ display: "contents" }}>
              <Button variant="ghost" block>
                J&apos;ai déjà un compte
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <section className="container section">
        <ol className="landingSteps">
          <li>
            <span className="landingStepNum">1</span>
            <h3>Choisissez un modèle</h3>
            <p className="muted">Parcourez le catalogue et retenez celui qui vous plaît.</p>
          </li>
          <li>
            <span className="landingStepNum">2</span>
            <h3>Prenez deux photos</h3>
            <p className="muted">Une de face, une de profil, avec votre téléphone.</p>
          </li>
          <li>
            <span className="landingStepNum">3</span>
            <h3>Recevez vos mesures</h3>
            <p className="muted">
              Douze mesures de couture, expliquées simplement, à télécharger en PDF.
            </p>
          </li>
        </ol>
      </section>
    </main>
  );
}
