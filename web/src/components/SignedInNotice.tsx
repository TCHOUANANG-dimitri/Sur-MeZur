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
import { homeFor, ROLE_NAME } from "@/lib/home";

export function SignedInNotice({
  title,
  message,
  continueTo,
  continueLabel,
}: {
  title?: string;
  /** Phrase sous le nom : ce que la personne voulait faire. */
  message?: string;
  /** Destination du bouton principal ; par defaut l'espace du compte. */
  continueTo?: string;
  continueLabel?: string;
}) {
  const { user, logout } = useAuth();
  const router = useRouter();
  if (!user) return null;
  const role = ROLE_NAME[user.role] ?? user.role;

  return (
    <div className="containerNarrow section">
      <div className="card" style={{ padding: 24 }}>
        <h1 style={{ fontSize: 24 }}>{title ?? "Vous êtes déjà connecté"}</h1>
        <p style={{ marginTop: 12 }}>
          Compte ouvert : <strong>{user.full_name}</strong> ({role}).
        </p>
        {message && <p className="muted" style={{ marginTop: 8 }}>{message}</p>}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 20 }}>
          <Button onClick={() => router.replace(continueTo ?? homeFor(user.role))}>
            {continueLabel ?? "Aller à mon espace"}
          </Button>
          {/* Deconnexion sur place : la page demandee s'affiche ensuite telle
              qu'un visiteur la voit (formulaire, mesure sans compte). */}
          <Button variant="secondary" onClick={() => logout({ to: null })}>
            Changer de compte
          </Button>
        </div>
      </div>
    </div>
  );
}
