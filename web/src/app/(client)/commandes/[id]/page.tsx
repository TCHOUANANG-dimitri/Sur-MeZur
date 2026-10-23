"use client";

/**
 * Detail d'une commande cote client : suivi, tailleur (avec ses contacts),
 * modele et mesures envoyes, prix convenu une fois la commande acceptee,
 * discussion avec le tailleur. Annulation possible tant qu'elle attend.
 */

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { CatalogApi, MeasurementsApi, OrdersApi, TailorsApi } from "@/lib/api/endpoints";
import type { ChatMessage, GarmentModel, Measurement, Order, TailorContact, TailorProfile } from "@/lib/api/types";
import { useAuth } from "@/components/AuthProvider";
import { Button, Card, ErrorBanner, Input, PageHeader, Spinner, Textarea } from "@/components/ui";
import { IconCall, IconChat } from "@/components/icons";
import { formatCm, presentableGroups } from "@/lib/measurements";
import { copyText, whatsappHref } from "@/lib/contact";
import { tailorWhatsappMessage } from "@/lib/tailors";
import { OrderBadge, formatDateFR, formatFcfa } from "@/app/tailleur/_components";

const TRACKER: { key: string; label: string }[] = [
  { key: "new", label: "Envoyée au tailleur" },
  { key: "in_progress", label: "En confection" },
  { key: "ready_for_pickup", label: "Prête" },
  { key: "finished_delivered", label: "Livrée" },
];

export default function CommandeClient() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [order, setOrder] = useState<Order | null>(null);
  const [tailor, setTailor] = useState<TailorProfile | null>(null);
  const [contact, setContact] = useState<TailorContact | null>(null);
  const [model, setModel] = useState<GarmentModel | null>(null);
  const [measurement, setMeasurement] = useState<Measurement | null>(null);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [message, setMessage] = useState("");
  const [showCancel, setShowCancel] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const o = await OrdersApi.get(id);
      setOrder(o);
      TailorsApi.get(o.tailor_id).then(setTailor).catch(() => setTailor(null));
      TailorsApi.contact(o.tailor_id).then(setContact).catch(() => setContact(null));
      if (o.garment_model_id) CatalogApi.model(o.garment_model_id).then(setModel).catch(() => setModel(null));
      MeasurementsApi.list()
        .then((list) => setMeasurement(list.find((m) => m.id === o.measurement_id) ?? null))
        .catch(() => setMeasurement(null));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Commande introuvable.");
    }
  }, [id]);

  const loadChat = useCallback(async () => {
    if (!id) return;
    try {
      setChat(await OrdersApi.chat(id));
    } catch {
      /* la discussion reviendra a la prochaine actualisation */
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadChat();
    const timer = setInterval(() => void loadChat(), 5000);
    return () => clearInterval(timer);
  }, [loadChat]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim() || !id) return;
    const body = message.trim();
    setMessage("");
    try {
      await OrdersApi.sendChat(id, body);
      await loadChat();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Message non envoyé.");
      setMessage(body);
    }
  }

  async function cancel(e: React.FormEvent) {
    e.preventDefault();
    if (!id || reason.trim().length < 2) return;
    setBusy(true);
    setError("");
    try {
      setOrder(await OrdersApi.cancel(id, reason.trim()));
      setShowCancel(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Annulation impossible.");
    } finally {
      setBusy(false);
    }
  }

  if (!order) {
    return (
      <>
        <PageHeader title="Commande" back />
        <div className="container section">{error ? <ErrorBanner message={error} /> : <Spinner label="Chargement…" />}</div>
      </>
    );
  }

  const stepIndex = TRACKER.findIndex((t) => t.key === order.status);
  const activeStep = stepIndex === -1 ? TRACKER.length : stepIndex;
  const phone = contact?.phone ?? null;

  return (
    <div className="tPage">
      <PageHeader title={`Commande n° ${order.id.slice(0, 6).toUpperCase()}`} back />
      <ErrorBanner message={error} />
      <div>
        <OrderBadge status={order.status} />
      </div>

      {order.status !== "cancelled" && (
        <ol className="tTracker" aria-label="Suivi de la commande">
          {TRACKER.map((step, i) => (
            <li key={step.key} className={i < activeStep ? "tTrackerDone" : i === activeStep ? "tTrackerNow" : ""}>
              <span className="tTrackerDot" aria-hidden>✓</span>
              {step.label}
            </li>
          ))}
        </ol>
      )}

      <Card>
        <p style={{ margin: 0 }}>
          <strong>Tailleur :</strong>{" "}
          {tailor ? <Link href={`/tailleurs/${tailor.id}`}>{tailor.shop_name}</Link> : "…"}
          <br />
          <strong>Modèle :</strong> {model ? <Link href={`/modeles/${model.id}`}>{model.name}</Link> : order.garment_model_id ? "…" : "Aucun (à voir avec le tailleur)"}
          <br />
          <span className="tRowSub">
            Envoyée le {formatDateFR(order.created_at)}
            {order.desired_date ? ` · Souhaitée le ${formatDateFR(order.desired_date)}` : ""}
            {` · ${order.reception_mode === "delivery" ? "Livraison" : "Retrait à l'atelier"}`}
          </span>
        </p>
        {order.budget_amount != null && <p className="tRowSub" style={{ margin: "6px 0 0" }}>Budget indiqué : {formatFcfa(order.budget_amount)}</p>}
        {order.agreed_price != null && (
          <p style={{ margin: "6px 0 0" }}>
            Prix convenu : <strong>{formatFcfa(order.agreed_price)}</strong>
          </p>
        )}
        {order.client_notes && <p className="tRowSub" style={{ margin: "6px 0 0", whiteSpace: "pre-line" }}>Votre message : {order.client_notes}</p>}
        {order.decline_reason && <p className="tRowSub" style={{ margin: "6px 0 0" }}>Motif du refus : {order.decline_reason}</p>}
      </Card>

      {phone && tailor && (
        <div className="tActionRow">
          <a
            className="btn btnSecondary"
            href={`tel:${phone.replace(/[^\d+]/g, "")}`}
            onClick={() => void copyText(phone).then((ok) => setNotice(ok ? `Numéro ${phone} copié.` : ""))}
          >
            <IconCall size={18} aria-hidden /> Appeler
          </a>
          <a className="btn btnWhatsapp" href={whatsappHref(phone, tailorWhatsappMessage(tailor.shop_name, order.id))}>
            <IconChat size={18} aria-hidden /> WhatsApp
          </a>
        </div>
      )}
      {notice && <p className="tNotice" role="status">{notice}</p>}

      {measurement && (
        <details className="card">
          <summary><strong>Mesures envoyées</strong> (prise n°{measurement.version})</summary>
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
        </details>
      )}

      <section aria-labelledby="chat-titre">
        <h2 id="chat-titre" style={{ fontSize: 18 }}>Discussion avec le tailleur</h2>
        <div className="tChat">
          {chat.length === 0 && <p className="muted">Aucun message. Écrivez le premier.</p>}
          {chat.map((m) => (
            <div key={m.id} className={`tMsg ${m.sender_id === user?.id ? "tMsgMine" : ""}`}>
              {m.body}
              <div className="tMsgDate">{formatDateFR(m.created_at)}</div>
            </div>
          ))}
        </div>
        {order.status !== "cancelled" && (
          <form onSubmit={send} style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <Input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Écrire au tailleur…"
              aria-label="Message au tailleur"
              maxLength={2000}
              style={{ flex: 1 }}
            />
            <Button type="submit" disabled={!message.trim()}>Envoyer</Button>
          </form>
        )}
      </section>

      {order.status === "new" && (
        <div>
          {!showCancel ? (
            <Button variant="ghost" onClick={() => setShowCancel(true)}>Annuler la commande</Button>
          ) : (
            <form onSubmit={cancel} className="card">
              <label className="field">
                <span className="fieldLabel">Pourquoi annulez-vous ?</span>
                <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} />
              </label>
              <div className="tActionRow">
                <Button type="submit" variant="danger" disabled={reason.trim().length < 2 || busy}>
                  Confirmer l&apos;annulation
                </Button>
                <Button variant="ghost" onClick={() => setShowCancel(false)}>Garder</Button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
