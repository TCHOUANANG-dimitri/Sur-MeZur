"use client";

/**
 * Acces direct par l'adresse du site : on reprend l'acces deja cree sur cet
 * appareil, sinon on en cree un (POST /public/enquete/nouveau), puis on ouvre
 * le formulaire. Les liens personnels envoyes par l'equipe (/<jeton>)
 * fonctionnent toujours a l'identique.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, enquete, nouvelAcces } from "@/lib/api";
import { jetonMemorise, memoriserJeton, oublierJeton } from "@/lib/jeton";
import { Button, EmptyState, Spinner } from "@/components/ui";

export default function Racine() {
  const router = useRouter();
  const [erreur, setErreur] = useState("");
  const [essai, setEssai] = useState(0);

  useEffect(() => {
    let annule = false;
    (async () => {
      setErreur("");
      try {
        let token = jetonMemorise();
        if (token) {
          try {
            await enquete(token).accueil();
          } catch (e) {
            // Acces desactive ou inconnu : on repart d'un nouvel acces.
            if (e instanceof ApiError && (e.status === 404 || e.status === 410)) {
              oublierJeton();
              token = null;
            } else {
              throw e;
            }
          }
        }
        if (!token) {
          token = (await nouvelAcces()).token;
          memoriserJeton(token);
        }
        if (!annule) router.replace(`/${token}`);
      } catch (e) {
        if (!annule) setErreur((e as Error).message);
      }
    })();
    return () => {
      annule = true;
    };
  }, [router, essai]);

  return (
    <main className="page">
      {erreur ? (
        <EmptyState
          title="Ouverture impossible"
          body={erreur}
          action={<Button onClick={() => setEssai((n) => n + 1)}>Réessayer</Button>}
        />
      ) : (
        <Spinner label="Ouverture du questionnaire…" />
      )}
    </main>
  );
}
