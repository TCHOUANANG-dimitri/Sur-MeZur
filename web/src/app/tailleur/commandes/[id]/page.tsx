"use client";

/**
 * Detail d'une commande recue (B3.6) : accepter / refuser avec motif, suivi
 * du statut, messagerie avec le client, modele demande et mesures quand
 * elles sont accessibles. Aucune offre, aucun devis, aucun paiement.
 */

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { CatalogApi, MeasurementsApi, OrdersApi } from "@/lib/api/endpoints";
import { TailorApi } from "@/lib/api/tailor";
import type { GarmentModel, Measurement } from "@/lib/api/types";
import { formatCm, presentableGroups } from "@/lib/measurements";
import { Button, Card, ErrorBanner, Input, PageHeader, Spinner, Textarea } from "@/components/ui";
import { OrderBadge, formatDateFR } from "../../_components";

interface ChatMsg {
  id: string;
  body: string | null;
  created_at: string;
  sender_id: string;
}

const TRACKER: { key: string; label: string }[] = [
  { key: "new", label: "Commande reçue" },
  { key: "in_progress", label: "En confection" },
  { key: "ready_for_pickup", label: "Prête" },
  { key: "finished_delivered", label: "Livrée" },
];

export default function CommandeDetail() {
  const { id } = useParams<{ id: string }>();
  const [order, setOrder] = useState<Awaited<ReturnType<typeof TailorApi.order>> | null>(null);
  const [model, setModel] = useState<GarmentModel | null>(null);
  const [measurement, setMeasurement] = useState<Measurement | null>(null);
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [message, setMessage] = useState("");
  const [reason, setReason] = useState("");
  const [showRefuse, setShowRefuse] = useState(false);
  const [dispute, setDispute] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const o = await TailorApi.order(id);
      setOrder(o);
      if (o.garment_model_id) {
        CatalogApi.model(o.garment_model_id).then(setModel).catch(() => setModel(null));
      }
      MeasurementsApi.list()
        .then((list) => setMeasurement(list.find((m) => m.id === o.measurement_id) ?? null))
        .catch(() => setMeasurement(null));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chargement impossible.");
    }
  }, [id]);

  const loadChat = useCallback(async () => {
    if (!id) return;
    try {
      setChat(await TailorApi.orderChat(id));
    } catch {
      /* la discussion reviendra a la prochaine actualisation */
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadChat();
    const timer = setInterval(() => void loadChat(), 4000);
    return () => clearInterval(timer);
  }, [loadChat]);

  async function act(fn: () => Promise<unknown>) {
    setError("");
    setBusy(true);
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim() || !id) return;
    const body = message.trim();
    setMessage("");
    try {
      await TailorApi.sendOrderChat(id, body);
      await loadChat();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Message non envoyé.");
      setMessage(body);
    }
  }

  if (!order) {
    return (
      <>
        <PageHeader title="Commande" back />
        {error ? <ErrorBanner message={error} /> : <Spinner label="Chargement…" />}
      </>
    );
  }

  const stepIndex = TRACKER.findIndex((t) => t.key === order.status);
  const activeStep = stepIndex === -1 ? TRACKER.length : stepIndex;

  return (
    <div className="tPage">
      <PageHeader title={`Commande n°${order.id.slice(0, 8)}`} back />
      <ErrorBanner message={error} />
      <div>
        <OrderBadge status={order.status} />
      </div>

      <ol className="tTracker" aria-label="Suivi de la commande">
        {TRACKER.map((step, i) => (
          <li key={step.key} className={i < activeStep ? "tTrackerDone" : i === activeStep ? "tTrackerNow" : ""}>
            <span className="tTrackerDot" aria-hidden>✓</span>
            {step.label}
          </li>
        ))}
      </ol>

      <Card>
        <p style={{ margin: 0 }}>
          <strong>Modèle :</strong> {model ? model.name : order.garment_model_id ? "…" : "Sur mesure libre"}
          <br />
          <span className="tRowSub">
            Passée le {formatDateFR(order.created_at)}
            {order.desired_date ? ` · Souhaitée le ${formatDateFR(order.desired_date)}` : ""}
            {order.reception_mode ? ` · ${order.reception_mode === "pickup" ? "Retrait" : "Livraison"}` : ""}
          </span>
        </p>
      </Card>

      {measurement && (
        <Card>
          <strong>Mesures du client</strong>
          {presentableGroups(measurement.data).map((group) => (
            <div key={group.id}>
              <p className="tRowSub" style={{ margin: "8px 0 4px" }}>{group.title}</p>
              {group.items.map(({ key, info, value }) => (
                <p key={key} style={{ margin: "2px 0" }}>
                  {info.label} : <strong>{formatCm(value)}</strong>
                </p>
              ))}
            </div>
          ))}
        </Card>
      )}

      {order.status === "new" && (
        <Card>
          <div className="tActionRow">
            <Button onClick={() => void act(() => TailorApi.acceptOrder(order.id))} disabled={busy}>
              Accepter
            </Button>
            <Button variant="secondary" onClick={() => setShowRefuse((s) => !s)}>
              Refuser
            </Button>
          </div>
          {showRefuse && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (reason.trim()) void act(() => TailorApi.declineOrder(order.id, reason.trim()));
              }}
              style={{ marginTop: 10 }}
            >
              <label className="field">
                <span className="fieldLabel">Motif du refus</span>
                <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex. Délai trop court, modèle hors de mes spécialités…" />
              </label>
              <Button type="submit" variant="danger" block disabled={reason.trim().length < 3 || busy}>
                Confirmer le refus
              </Button>
            </form>
          )}
        </Card>
      )}

      {order.status === "in_progress" && (
        <Button block onClick={() => void act(() => TailorApi.setOrderStatus(order.id, "ready_for_pickup"))} disabled={busy}>
          Marquer comme prête
        </Button>
      )}
      {order.status === "ready_for_pickup" && (
        <Button block onClick={() => void act(() => TailorApi.setOrderStatus(order.id, "finished_delivered"))} disabled={busy}>
          Marquer comme livrée
        </Button>
      )}

      <section aria-labelledby="chat-titre">
        <h2 id="chat-titre" style={{ fontSize: 18 }}>Discussion</h2>
        <div className="tChat">
          {chat.length === 0 && <p className="muted">Aucun message. Écrivez le premier.</p>}
          {chat.map((m) => (
            <div key={m.id} className="tMsg">
              {m.body}
              <div className="tMsgDate">{formatDateFR(m.created_at)}</div>
            </div>
          ))}
        </div>
        <form onSubmit={send} style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <Input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Écrire au client…"
            aria-label="Message au client"
            style={{ flex: 1 }}
          />
          <Button type="submit" disabled={!message.trim()}>Envoyer</Button>
        </form>
      </section>

      {order.dispute_status === null && (
        <details>
          <summary className="authLink">Signaler un problème sur cette commande</summary>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (dispute.trim()) void act(() => OrdersApi.openDispute(order.id, dispute.trim()));
            }}
            style={{ marginTop: 8 }}
          >
            <Textarea rows={2} value={dispute} onChange={(e) => setDispute(e.target.value)} placeholder="Décrivez le problème…" />
            <div style={{ marginTop: 8 }}>
              <Button type="submit" variant="secondary" disabled={dispute.trim().length < 3 || busy}>
                Signaler
              </Button>
            </div>
          </form>
        </details>
      )}
    </div>
  );
}
