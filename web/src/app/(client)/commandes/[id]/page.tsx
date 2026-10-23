"use client";

/**
 * Detail d'une commande cote client : suivi, tailleur (avec ses contacts),
 * modele et mesures envoyes, prix convenu une fois la commande acceptee.
 * Annulation possible tant qu'elle attend. Pas de messagerie dans l'app :
 * le client joint le tailleur par appel ou WhatsApp.
 */

import { tr } from "@/lib/i18n";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { CatalogApi, MeasurementsApi, OrdersApi, TailorsApi } from "@/lib/api/endpoints";
import type { GarmentModel, Measurement, Order, TailorContact, TailorProfile } from "@/lib/api/types";
import { Button, Card, ErrorBanner, PageHeader, Spinner, Textarea } from "@/components/ui";
import { IconCall, IconChat } from "@/components/icons";
import { formatCm, presentableGroups } from "@/lib/measurements";
import { copyText, whatsappHref } from "@/lib/contact";
import { tailorWhatsappMessage } from "@/lib/tailors";
import { OrderBadge, formatDateFR, formatFcfa } from "@/app/tailleur/_components";

const TRACKER: { key: string; fr: string; en: string }[] = [
  { key: "new", fr: "Envoyée", en: "Sent" },
  { key: "in_progress", fr: "En confection", en: "Being made" },
  { key: "ready_for_pickup", fr: "Prête", en: "Ready" },
  { key: "finished_delivered", fr: "Livrée", en: "Delivered" },
];

export default function CommandeClient() {
  const { id } = useParams<{ id: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [tailor, setTailor] = useState<TailorProfile | null>(null);
  const [contact, setContact] = useState<TailorContact | null>(null);
  const [model, setModel] = useState<GarmentModel | null>(null);
  const [measurement, setMeasurement] = useState<Measurement | null>(null);
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
      setError(e instanceof Error ? e.message : tr("Commande introuvable.", "Order not found."));
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function cancel(e: React.FormEvent) {
    e.preventDefault();
    if (!id || reason.trim().length < 2) return;
    setBusy(true);
    setError("");
    try {
      setOrder(await OrdersApi.cancel(id, reason.trim()));
      setShowCancel(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : tr("Annulation impossible.", "Could not cancel."));
    } finally {
      setBusy(false);
    }
  }

  if (!order) {
    return (
      <>
        <PageHeader title={tr("Commande", "Order")} back />
        <div className="container section">{error ? <ErrorBanner message={error} /> : <Spinner />}</div>
      </>
    );
  }

  const stepIndex = TRACKER.findIndex((t) => t.key === order.status);
  const activeStep = stepIndex === -1 ? TRACKER.length : stepIndex;
  const phone = contact?.phone ?? null;

  return (
    <div className="tPage">
      <PageHeader title={`${tr("Commande", "Order")} n° ${order.id.slice(0, 6).toUpperCase()}`} back />
      <ErrorBanner message={error} />
      <div>
        <OrderBadge status={order.status} />
      </div>

      {order.status !== "cancelled" && (
        <ol className="tTracker" aria-label={tr("Suivi", "Progress")}>
          {TRACKER.map((step, i) => (
            <li key={step.key} className={i < activeStep ? "tTrackerDone" : i === activeStep ? "tTrackerNow" : ""}>
              <span className="tTrackerDot" aria-hidden>✓</span>
              {tr(step.fr, step.en)}
            </li>
          ))}
        </ol>
      )}

      <Card>
        <p style={{ margin: 0 }}>
          <strong>{tr("Tailleur", "Tailor")} :</strong>{" "}
          {tailor ? <Link href={`/tailleurs/${tailor.id}`}>{tailor.shop_name}</Link> : "…"}
          <br />
          <strong>{tr("Modèle", "Style")} :</strong> {model ? <Link href={`/modeles/${model.id}`}>{model.name}</Link> : order.garment_model_id ? "…" : tr("Aucun", "None")}
          <br />
          <span className="tRowSub">
            {formatDateFR(order.created_at)}
            {order.desired_date ? ` · ${tr("pour le", "for")} ${formatDateFR(order.desired_date)}` : ""}
            {` · ${order.reception_mode === "delivery" ? tr("Livraison", "Delivery") : tr("Retrait à l'atelier", "Pick-up")}`}
          </span>
        </p>
        {order.budget_amount != null && <p className="tRowSub" style={{ margin: "6px 0 0" }}>{tr("Budget", "Budget")} : {formatFcfa(order.budget_amount)}</p>}
        {order.agreed_price != null && (
          <p style={{ margin: "6px 0 0" }}>
            {tr("Prix convenu", "Agreed price")} : <strong>{formatFcfa(order.agreed_price)}</strong>
          </p>
        )}
        {order.client_notes && <p className="tRowSub" style={{ margin: "6px 0 0", whiteSpace: "pre-line" }}>{tr("Votre message", "Your message")} : {order.client_notes}</p>}
        {order.decline_reason && <p className="tRowSub" style={{ margin: "6px 0 0" }}>{tr("Motif du refus", "Reason declined")} : {order.decline_reason}</p>}
      </Card>

      {phone && tailor && (
        <div className="tActionRow">
          <a
            className="btn btnSecondary"
            href={`tel:${phone.replace(/[^\d+]/g, "")}`}
            onClick={() => void copyText(phone).then((ok) => setNotice(ok ? tr(`Numéro ${phone} copié.`, `Number ${phone} copied.`) : ""))}
          >
            <IconCall size={18} aria-hidden /> {tr("Appeler", "Call")}
          </a>
          <a className="btn btnWhatsapp" href={whatsappHref(phone, tailorWhatsappMessage(tailor.shop_name, order.id))}>
            <IconChat size={18} aria-hidden /> WhatsApp
          </a>
        </div>
      )}
      {notice && <p className="tNotice" role="status">{notice}</p>}

      {measurement && (
        <details className="card">
          <summary><strong>{tr("Mesures envoyées", "Measurements sent")}</strong> (n°{measurement.version})</summary>
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

      {order.status === "new" && (
        <div>
          {!showCancel ? (
            <Button variant="ghost" onClick={() => setShowCancel(true)}>{tr("Annuler la commande", "Cancel order")}</Button>
          ) : (
            <form onSubmit={cancel} className="card">
              <label className="field">
                <span className="fieldLabel">{tr("Pourquoi ?", "Why?")}</span>
                <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} />
              </label>
              <div className="tActionRow">
                <Button type="submit" variant="danger" disabled={reason.trim().length < 2 || busy}>
                  {tr("Confirmer", "Confirm")}
                </Button>
                <Button variant="ghost" onClick={() => setShowCancel(false)}>{tr("Garder", "Keep")}</Button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
