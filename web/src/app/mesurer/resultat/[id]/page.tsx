"use client";

/**
 * Resultat partiel, pour un visiteur sans compte.
 *
 * Le serveur ne renvoie que cinq valeurs (voir backend
 * measurements.py::GUEST_VISIBLE_KEYS) et la liste des mesures retenues.
 * Les chiffres floutes affiches ici sont donc FACTICES : les vraies valeurs
 * n'ont jamais quitte le serveur. Un flou applique a de vraies valeurs
 * aurait ete lisible par quiconque ouvre les outils de developpement.
 *
 * L'inscription convertit le compte invite sur place : la personne retrouve
 * ses douze mesures sans reprendre ses photos.
 */

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { MeasurementsApi } from "@/lib/api/endpoints";
import { friendlyError, isTransientError, withRetry } from "@/lib/retry";
import type { Measurement } from "@/lib/api/types";
import { formatCm, presentableGroupsWithLocked } from "@/lib/measurements";
import { useAuth } from "@/components/AuthProvider";
import { Button, EmptyState, ErrorBanner, Spinner } from "@/components/ui";
import { IconLock, IconMeasure, IconUserPlus } from "@/components/icons";

/** Chiffre de remplacement, a largeur constante, rendu illisible par le flou. */
const PLACEHOLDER = "88,8 cm";

export default function ResultatInvite() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user, loading } = useAuth();
  const [measurement, setMeasurement] = useState<Measurement | null | undefined>(undefined);
  const [error, setError] = useState("");
  // Echec de CHARGEMENT (serveur sature, reseau coupe), a ne pas confondre
  // avec des mesures reellement absentes : dans le premier cas, elles sont
  // bien enregistrees et il suffit de reessayer.
  const [loadFailed, setLoadFailed] = useState(false);

  // Deja inscrit (compte converti, ou client connecte) : la page complete
  // existe, garder le floutage n'aurait aucun sens.
  useEffect(() => {
    if (!loading && user && !user.is_guest) router.replace(`/mesures/${id}`);
  }, [loading, user, id, router]);

  useEffect(() => {
    if (!id) return;
    withRetry(() => MeasurementsApi.list())
      .then((list) => setMeasurement(list.find((m) => m.id === id) ?? null))
      .catch((e) => {
        setLoadFailed(isTransientError(e));
        setError(friendlyError(e, "réessayez"));
        setMeasurement(null);
      });
  }, [id]);

  const next = `/mesures/${id}`;
  const signupHref = `/inscription?suite=${encodeURIComponent(next)}`;
  const loginHref = `/connexion?suite=${encodeURIComponent(next)}`;

  if (measurement === undefined) return <Spinner label="Chargement de vos mesures…" />;

  if (measurement === null && loadFailed) {
    return (
      <div className="containerNarrow section">
        <ErrorBanner message={error} />
        <EmptyState
          icon={<IconMeasure size={30} strokeWidth={1.6} />}
          title="Vos mesures ne peuvent pas s'afficher pour l'instant"
          body="Elles ont bien été calculées et enregistrées. Réessayez dans un instant."
          action={<Button onClick={() => window.location.reload()}>Réessayer</Button>}
        />
      </div>
    );
  }

  if (measurement === null) {
    return (
      <div className="containerNarrow section">
        <ErrorBanner message={error} />
        <EmptyState
          icon={<IconMeasure size={30} strokeWidth={1.6} />}
          title="Ces mesures sont introuvables"
          body="Votre session a peut-être expiré. Reprenez vos photos : cela ne prend qu'une minute."
          action={
            <Link href="/mesurer">
              <Button>Reprendre mes mesures</Button>
            </Link>
          }
        />
      </div>
    );
  }

  const lockedKeys = measurement.locked_keys ?? [];
  const groups = presentableGroupsWithLocked(measurement.data, lockedKeys);
  const total = groups.reduce((n, g) => n + g.items.length, 0);
  const visible = groups.reduce((n, g) => n + g.items.filter((i) => !i.locked).length, 0);
  const hasLocked = visible < total;

  if (total === 0) {
    return (
      <div className="containerNarrow section">
        <EmptyState
          icon={<IconMeasure size={30} strokeWidth={1.6} />}
          title="Aucune mesure exploitable"
          body="L'analyse n'a rien pu retenir de ces photos. Reprenez-les en suivant bien les consignes de posture."
          action={
            <Link href="/mesurer">
              <Button>Reprendre mes photos</Button>
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="container section">
      <div className="resultIntro">
        <h2>Vos mesures sont prêtes</h2>
        <p className="muted">
          {hasLocked
            ? `Voici ${visible} de vos ${total} mensurations. Les autres sont déjà calculées et n'attendent que votre compte.`
            : "Voici vos mensurations."}
        </p>
      </div>

      {hasLocked && (
        <section className="unlockCard" aria-labelledby="unlock-title">
          <div>
            <h2 id="unlock-title">Débloquez vos {total} mensurations</h2>
            <p>
              Créez votre compte avec votre numéro de téléphone : vos mesures y sont
              enregistrées, et vous pourrez télécharger la fiche à remettre à votre tailleur.
            </p>
          </div>
          <div className="unlockActions">
            <Link href={signupHref} style={{ display: "contents" }}>
              <Button block>
                <IconUserPlus size={18} aria-hidden /> Créer mon compte
              </Button>
            </Link>
            <Link href={loginHref} className="unlockLogin">
              J&apos;ai déjà un compte
            </Link>
          </div>
        </section>
      )}

      {groups.map((group) => (
        <section key={group.id} className="measureGroup">
          <h3 className="measureGroupTitle">{group.title}</h3>
          <div className="measureList">
            {group.items.map(({ key, info, value, locked }) => (
              <div key={key} className={`measureItem ${locked ? "measureItemLocked" : ""}`}>
                <div className="measureItemHead">
                  <span className="measureName">
                    {locked && <IconLock size={14} className="measureLockIcon" aria-hidden />}
                    {info.label}
                  </span>
                  {locked || value === null ? (
                    <>
                      <span className="measureValue measureValueLocked" aria-hidden>
                        {PLACEHOLDER}
                      </span>
                      <span className="visually-hidden">
                        Valeur disponible après la création du compte
                      </span>
                    </>
                  ) : (
                    <span className="measureValue">{formatCm(value)}</span>
                  )}
                </div>
                <p className="measureWhere">{info.where}</p>
                {!locked && <p className="measurePurpose">{info.purpose}</p>}
              </div>
            ))}
          </div>
        </section>
      ))}

      {hasLocked && (
        <div className="unlockBar">
          <Link href={signupHref} style={{ display: "contents" }}>
            <Button block>
              <IconLock size={17} aria-hidden /> Voir mes {total} mensurations
            </Button>
          </Link>
        </div>
      )}
    </div>
  );
}
