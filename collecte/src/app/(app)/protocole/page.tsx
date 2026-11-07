"use client";

/**
 * Protocole de reference, consultable hors reseau : la convention de mesure
 * ecrite commune a tous les agents. Un onglet par sexe : l'agent ne lit que
 * les mesures de son volontaire.
 */

import { useState } from "react";
import { Chip, PageHeader } from "@/components/ui";
import { SilhouetteFace, SilhouetteProfil } from "@/components/Silhouettes";
import { IconWarning } from "@/components/icons";
import {
  GENDER_LABELS,
  MEASURES,
  PREPARATION,
  REPERES,
  RUBAN_RULES,
  SHOOTING_RULES,
  VIEWS,
  measureGroups,
  measureKeys,
  requiredViews,
  type Gender,
} from "@/lib/protocol";

export default function Protocole() {
  const [gender, setGender] = useState<Gender>("female");
  const groups = measureGroups("tailleur", gender);

  return (
    <>
      <PageHeader title="Protocole" />
      <div className="containerNarrow section stack">
        <section className="card">
          <h2 className="sectionTitle">Déroulé d&apos;une séance</h2>
          <ol className="rules">
            <li>Expliquer la démarche et recueillir le consentement du volontaire.</li>
            <li>Mesurer la taille (contre un mur, avec un livre posé sur la tête) et le poids (balance), jamais sur simple déclaration.</li>
            <li>Nouer la ficelle de taille (voir « Avant de commencer »).</li>
            <li>
              Relever les mesures au mètre ruban, dans l&apos;ordre de l&apos;application : 20 pour un homme, 26 pour une
              femme.
            </li>
            <li>1 volontaire sur 5 : reprendre toutes les mesures une 2ᵉ fois (mesure de contrôle).</li>
            <li>Retirer la ficelle, puis prendre les 3 photos (face, profil, dos) dans la même tenue.</li>
            <li>Relire le récapitulatif, puis enregistrer.</li>
          </ol>
        </section>

        <section className="card">
          <h2 className="sectionTitle">Avant de commencer</h2>
          <ol className="rules">
            {PREPARATION.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ol>
          <h3 className="groupTitle">Règles du ruban</h3>
          <ul className="rules">
            {RUBAN_RULES.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </section>

        <section className="card">
          <h2 className="sectionTitle">Repères du corps</h2>
          <dl className="protocolList">
            {REPERES.map((r) => (
              <div key={r.name}>
                <dt>{r.name}</dt>
                <dd>{r.how}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="card">
          <h2 className="sectionTitle">Photos</h2>
          <ul className="rules">
            {SHOOTING_RULES.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          <div className="poseGrid">
            {requiredViews("tailleur").map((v) => (
              <div key={v} className="poseCard">
                {VIEWS[v].silhouette === "face" ? (
                  <SilhouetteFace className="poseSilhouette" />
                ) : (
                  <SilhouetteProfil className="poseSilhouette" />
                )}
                <strong>{VIEWS[v].label} *</strong>
                <span className="muted small">{VIEWS[v].pose}</span>
              </div>
            ))}
          </div>
          <p className="muted small">* obligatoire</p>
        </section>

        <section className="card cardFlat">
          <h2 className="sectionTitle">Les mesures</h2>
          <div className="chipRow chipRowWrap" role="tablist" aria-label="Sexe du volontaire">
            {(Object.keys(GENDER_LABELS) as Gender[]).map((g) => (
              <Chip key={g} type="button" role="tab" aria-selected={gender === g} active={gender === g} onClick={() => setGender(g)}>
                {GENDER_LABELS[g]} · {measureKeys("tailleur", g).length} mesures
              </Chip>
            ))}
          </div>
        </section>

        {groups.map((g) => (
          <section key={g.id} className="card">
            <h2 className="sectionTitle">{g.title}</h2>
            <dl className="protocolList">
              {g.keys.map((k) => {
                const m = MEASURES[k];
                return (
                  <div key={k}>
                    <dt>
                      {m.label}{" "}
                      <span className="muted small">
                        (souvent {m.usual[0]}–{m.usual[1]} cm)
                      </span>
                    </dt>
                    <dd>
                      <p className="measureWhereBlock">{m.where}</p>
                      <ol className="measureSteps">
                        {m.steps.map((s) => (
                          <li key={s}>{s}</li>
                        ))}
                      </ol>
                      {m.attention && (
                        <p className="measureAttention">
                          <IconWarning size={14} aria-hidden /> {m.attention}
                        </p>
                      )}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </section>
        ))}
      </div>
    </>
  );
}
