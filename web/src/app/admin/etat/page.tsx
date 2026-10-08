"use client";

// Etat technique (M13) : version, heure serveur, base, disques, sauvegardes
// (dossier BACKUP_DIR), chaine de mesure, compteurs.

import { Security } from "@/lib/api/admin";
import { ErrorState, Loading, PageHead, Panel, useLoad } from "@/components/admin/kit";
import { bytes, formatDateTime, formatNumber } from "@/components/admin/format";

export default function StatePage() {
  const state = useLoad(() => Security.system(), []);

  if (state.error) return <div className="adPage"><PageHead title="État technique" /><ErrorState error={state.error} onRetry={state.reload} /></div>;
  if (!state.data) return <div className="adPage"><Loading /></div>;
  const s = state.data;

  return (
    <div className="adPage">
      <PageHead title="État technique" sub={`Heure serveur : ${formatDateTime(s.server_time)}`} />
      <div className="adGrid2">
        <Panel title="Application et base">
          <dl>
            <div className="adKv"><dt>Version</dt><dd>{s.app_version}</dd></div>
            <div className="adKv"><dt>Base</dt><dd>{s.database.dialect} — {s.database.ok ? "joignable" : `erreur : ${s.database.error ?? "?"}`}{s.database.size_bytes != null && ` · ${bytes(s.database.size_bytes)}`}</dd></div>
          </dl>
          <h4>Disques</h4>
          <ul className="adList">
            {s.disks.map((d) => (
              <li key={d.path}>{d.label} ({d.path}) : {bytes(d.total_bytes - d.free_bytes)} / {bytes(d.total_bytes)} ({formatNumber(d.used_pct, 0)} %)</li>
            ))}
          </ul>
        </Panel>
        <Panel title="Sauvegardes">
          {s.backup ? (
            <dl>
              <div className="adKv"><dt>Dossier</dt><dd>{s.backup.folder}</dd></div>
              <div className="adKv"><dt>Dernière</dt><dd>{s.backup.last ? `${formatDateTime(s.backup.last)}${s.backup.age_hours != null ? ` (il y a ${formatNumber(s.backup.age_hours, 1)} h)` : ""}` : "aucune"}</dd></div>
              {s.backup.file && <div className="adKv"><dt>Fichier</dt><dd>{s.backup.file}{s.backup.size_bytes != null && ` · ${bytes(s.backup.size_bytes)}`}</dd></div>}
              {s.backup.count != null && <div className="adKv"><dt>Conservées</dt><dd>{s.backup.count}</dd></div>}
            </dl>
          ) : (
            <p className="adWarn">Aucune sauvegarde configurée (variable BACKUP_DIR). À régler avant la mise en production.</p>
          )}
        </Panel>
      </div>
      <div className="adGrid2">
        <Panel title="Chaîne de mesure">
          <pre className="adCode">{JSON.stringify(s.measurement_chain, null, 2)}</pre>
        </Panel>
        <Panel title="Compteurs">
          <ul className="adList">{Object.entries(s.counts).map(([k, v]) => <li key={k}>{k} : <strong>{formatNumber(v)}</strong></li>)}</ul>
        </Panel>
      </div>
    </div>
  );
}
