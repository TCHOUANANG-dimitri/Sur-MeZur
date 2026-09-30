"use client";

/**
 * Protocole de reference, consultable hors reseau : la convention de mesure
 * ecrite commune a tous les agents.
 */

import { PageHeader } from "@/components/ui";
import { SilhouetteFace, SilhouetteProfil } from "@/components/Silhouettes";
import { MEASURE_GROUPS, MEASURES, SHOOTING_RULES, VIEW_KEYS, VIEWS } from "@/lib/protocol";

export default function Protocole() {
  return (
    <>
      <PageHeader title="Protocole" />
      <div className="containerNarrow section stack">
        <section className="card">
          <h2 className="sectionTitle">Déroulé d&apos;une séance</h2>
          <ol className="rules">
            <li>Expliquer la démarche et recueillir le consentement du volontaire.</li>
            <li>Mesurer la taille (toise) et le poids (balance) — jamais sur simple déclaration.</li>
            <li>Relever les 12 mensurations au mètre ruban, dans l&apos;ordre de l&apos;application.</li>
            <li>Prendre au minimum les photos de face et de profil, dans la même tenue.</li>
            <li>Relire le récapitulatif, puis enregistrer.</li>
          </ol>
        </section>

        <section className="card">
          <h2 className="sectionTitle">Photos</h2>
          <ul className="rules">
            {SHOOTING_RULES.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          <div className="poseGrid">
            {VIEW_KEYS.map((v) => (
              <div key={v} className="poseCard">
                {VIEWS[v].silhouette === "face" ? (
                  <SilhouetteFace className="poseSilhouette" />
                ) : (
                  <SilhouetteProfil className="poseSilhouette" />
                )}
                <strong>
                  {VIEWS[v].label}
                  {VIEWS[v].required ? " *" : ""}
                </strong>
                <span className="muted small">{VIEWS[v].pose}</span>
              </div>
            ))}
          </div>
          <p className="muted small">* obligatoire</p>
        </section>

        {MEASURE_GROUPS.map((g) => (
          <section key={g.id} className="card">
            <h2 className="sectionTitle">{g.title}</h2>
            <dl className="protocolList">
              {g.keys.map((k) => (
                <div key={k}>
                  <dt>
                    {MEASURES[k].label}{" "}
                    <span className="muted small">
                      (souvent {MEASURES[k].usual[0]}–{MEASURES[k].usual[1]} cm)
                    </span>
                  </dt>
                  <dd>{MEASURES[k].how}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </>
  );
}
