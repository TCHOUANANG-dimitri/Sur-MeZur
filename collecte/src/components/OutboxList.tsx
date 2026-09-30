"use client";

/**
 * Fiches encore sur l'appareil, pas (entierement) recues par le serveur.
 */

import { useState } from "react";
import { useOutbox } from "./OutboxProvider";
import { Badge, Button } from "./ui";
import { IconDelete, IconOffline, IconRetry, IconUpload } from "./icons";
import { removeOutbox, type OutboxItem } from "@/lib/outbox";
import { GENDER_LABELS, VIEW_KEYS, fmtNum } from "@/lib/protocol";

function status(item: OutboxItem) {
  if (item.blocked) return <Badge tone="error">Refusée</Badge>;
  if (item.server_id) return <Badge tone="pending">Photos en cours</Badge>;
  return <Badge tone="neutral">En attente</Badge>;
}

export function OutboxList() {
  const { items, syncing, offline, sync, reload } = useOutbox();
  const [confirming, setConfirming] = useState<string | null>(null);

  if (items.length === 0) return null;

  async function drop(uuid: string) {
    await removeOutbox(uuid);
    setConfirming(null);
    await reload();
  }

  return (
    <section className="card outbox">
      <div className="outboxHead">
        <h2 className="sectionTitle">
          {offline ? <IconOffline size={18} aria-hidden /> : <IconUpload size={18} aria-hidden />} À envoyer ({items.length})
        </h2>
        <Button variant="secondary" className="btnSmall" onClick={() => void sync(true)} disabled={syncing}>
          <IconRetry size={16} aria-hidden /> {syncing ? "Envoi…" : "Envoyer maintenant"}
        </Button>
      </div>
      <p className="muted small">
        {offline
          ? "Pas de connexion au serveur : ces fiches sont gardées sur ce téléphone et partiront toutes seules au retour du réseau. Ne videz pas les données du navigateur."
          : "Ces fiches sont gardées sur ce téléphone jusqu'à ce que le serveur ait tout reçu."}
      </p>
      <ul className="outboxList">
        {items.map((item) => {
          const views = VIEW_KEYS.filter((v) => item.photos[v]);
          return (
            <li key={item.client_uuid} className="outboxItem">
              <div className="outboxMain">
                <strong>{item.code ?? "Nouvelle fiche"}</strong>
                <span className="muted small">
                  {GENDER_LABELS[item.payload.gender]} · {fmtNum(item.payload.height_cm)} cm ·{" "}
                  {fmtNum(item.payload.weight_kg)} kg ·{" "}
                  {views.length === 0 ? "sans photo" : `${item.uploaded.length}/${views.length} photo(s) envoyée(s)`}
                </span>
                {item.last_error && <span className={item.blocked ? "checkError" : "checkWarn"}>{item.last_error}</span>}
              </div>
              <div className="outboxSide">
                {status(item)}
                {item.blocked &&
                  (confirming === item.client_uuid ? (
                    <Button variant="danger" className="btnSmall" onClick={() => void drop(item.client_uuid)}>
                      Confirmer
                    </Button>
                  ) : (
                    <button
                      className="iconBtn"
                      onClick={() => setConfirming(item.client_uuid)}
                      aria-label="Supprimer cette fiche de l'appareil"
                    >
                      <IconDelete size={18} aria-hidden />
                    </button>
                  ))}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
