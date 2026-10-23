"use client";

/**
 * « Vous etes connecte en tant que … » : affiche quand la session ouverte ne
 * correspond pas a la page demandee (connexion, inscription, mesure sans
 * compte, page reservee a un autre role).
 *
 * Remplace les redirections silencieuses vers « mon espace » : arrivee depuis
 * la page d'accueil avec une ancienne session administrateur, la personne
 * etait renvoyee vers /admin sans comprendre pourquoi ni pouvoir changer de
 * compte. Ici, elle choisit.
 */

import { useRouter } from "next/navigation";
import { useAuth } from "./AuthProvider";
import { Button } from "./ui";
import { homeFor, roleName } from "@/lib/home";
import { tr } from "@/lib/i18n";

export function SignedInNotice({
  title,
  message,
  continueTo,
  continueLabel,
  switchTo,
}: {
  title?: string;
  /** Phrase sous le nom : ce que la personne voulait faire. */
  message?: string;
  /** Destination du bouton principal ; par defaut l'espace du compte. */
  continueTo?: string;
  continueLabel?: string;
  /** Ou aller apres « Changer de compte ». Par defaut on reste sur place
   *  (la page s'affiche telle qu'un visiteur la voit : formulaire, mesure
   *  sans compte). Une page reservee a un autre role passe la connexion :
   *  rester sur place y relancerait l'ecran en boucle. */
  switchTo?: string;
}) {
  const { user, logout } = useAuth();
  const router = useRouter();
  if (!user) return null;
  const role = roleName(user.role);

  return (
    <div className="containerNarrow section">
      <div className="card" style={{ padding: 24 }}>
        <h1 style={{ fontSize: 24 }}>{title ?? tr("Vous êtes déjà connecté", "You are already signed in")}</h1>
        <p style={{ marginTop: 12 }}>
          <strong>{user.full_name}</strong> ({role})
        </p>
        {message && <p className="muted" style={{ marginTop: 8 }}>{message}</p>}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 20 }}>
          <Button onClick={() => router.replace(continueTo ?? homeFor(user.role))}>
            {continueLabel ?? tr("Aller à mon espace", "Go to my space")}
          </Button>
          {/* Deconnexion sur place : la page demandee s'affiche ensuite telle
              qu'un visiteur la voit (formulaire, mesure sans compte). */}
          <Button variant="secondary" onClick={() => logout({ to: switchTo ?? null })}>
            {tr("Changer de compte", "Switch account")}
          </Button>
        </div>
      </div>
    </div>
  );
}
