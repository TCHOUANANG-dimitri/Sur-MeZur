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

import { tr } from "@/lib/i18n";
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
        setError(friendlyError(e, tr("réessayez", "try again")));
        setMeasurement(null);
      });
  }, [id]);

  const next = `/mesures/${id}`;
  const signupClientHref = `/inscription?suite=${encodeURIComponent(next)}&role=client`;
  const signupTailleurHref = `/inscription?suite=${encodeURIComponent(next)}&role=tailleur`;
  const loginHref = `/connexion?suite=${encodeURIComponent(next)}`;

  if (measurement === undefined) return <Spinner />;

  if (measurement === null && loadFailed) {
    return (
      <div className="containerNarrow section">
        <ErrorBanner message={error} />
        <EmptyState
          icon={<IconMeasure size={30} strokeWidth={1.6} />}
          title={tr("Affichage impossible pour l'instant", "Can't display right now")}
          body={tr("Vos mesures sont enregistrées. Réessayez.", "Your measurements are saved. Try again.")}
          action={<Button onClick={() => window.location.reload()}>{tr("Réessayer", "Try again")}</Button>}
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
          title={tr("Mesures introuvables", "Measurements not found")}
          body={tr("Session expirée ? Reprenez vos photos.", "Session expired? Retake your photos.")}
          action={
            <Link href="/mesurer">
              <Button>{tr("Reprendre mes mesures", "Measure again")}</Button>
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
          title={tr("Aucune mesure exploitable", "No usable measurements")}
          body={tr("Reprenez les photos en suivant les consignes.", "Retake the photos following the instructions.")}
          action={
            <Link href="/mesurer">
              <Button>{tr("Reprendre mes photos", "Retake photos")}</Button>
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="container section">
      <div className="resultIntro">
        <h2>{tr("Vos mesures sont prêtes", "Your measurements are ready")}</h2>
        {hasLocked && <p className="muted">{tr(`${visible} sur ${total} visibles.`, `${visible} of ${total} shown.`)}</p>}
      </div>

      {hasLocked && (
        <section className="unlockCard" aria-labelledby="unlock-title">
          <div>
            <h2 id="unlock-title">{tr(`Voir les ${total} mesures`, `See all ${total} measurements`)}</h2>
            <p>{tr("Créez votre compte avec votre numéro : c'est gratuit.", "Create your account with your phone number: it's free.")}</p>
          </div>
          <div className="unlockActions">
            <Link href={signupClientHref} style={{ display: "contents" }}>
              <Button block>
                <IconUserPlus size={18} aria-hidden /> {tr("Je suis client", "I'm a client")}
              </Button>
            </Link>
            <Link href={signupTailleurHref} style={{ display: "contents" }}>
              <Button block variant="secondary">
                {tr("Je suis tailleur", "I'm a tailor")}
              </Button>
            </Link>
            <Link href={loginHref} className="unlockLogin">
              {tr("J'ai déjà un compte", "I already have an account")}
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
                        {tr("Disponible après création du compte", "Available once you create an account")}
                      </span>
                    </>
                  ) : (
                    <span className="measureValue">{formatCm(value)}</span>
                  )}
                </div>
                <p className="measureWhere">{info.where}</p>
              </div>
            ))}
          </div>
        </section>
      ))}

      {hasLocked && (
        <div className="unlockBar">
          <Link href={signupClientHref} style={{ display: "contents" }}>
            <Button block>
              <IconLock size={17} aria-hidden /> {tr(`Voir mes ${total} mesures`, `See my ${total} measurements`)}
            </Button>
          </Link>
        </div>
      )}
    </div>
  );
}
