"use client";

/**
 * Detail d'une commande recue (B3.6) : accepter (avec le prix convenu) ou
 * refuser avec motif, suivi du statut, modele demande et mesures envoyees.
 * Aucune offre, aucun devis, aucun paiement, et pas de messagerie dans
 * l'app : le tailleur joint son client par appel ou WhatsApp.
 *
 * Le client se joint comme ceux du carnet : Appeler (numero copie),
 * WhatsApp, Enregistrer dans les contacts. « Ajouter a mon carnet » le range
 * avec ses mesures (sans doublon) ; une fois la commande acceptee, « Creer le
 * travail » la reporte dans Travaux, d'ou elle alimente les recettes.
 */

import { tr } from "@/lib/i18n";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { OrdersApi } from "@/lib/api/endpoints";
import { TailorApi } from "@/lib/api/tailor";
import type { OrderClient } from "@/lib/api/tailor";
import { formatCm, presentableGroups } from "@/lib/measurements";
import { Button, Card, ErrorBanner, Input, PageHeader, Spinner, Textarea } from "@/components/ui";
import { IconCall, IconChat, IconContact, IconUsers } from "@/components/icons";
import { copyText, openNewContact, whatsappHref } from "@/lib/contact";
import { amountError } from "@/lib/validation";
import { OrderBadge, formatDateFR, formatFcfa } from "../../_components";

const TRACKER: { key: string; fr: string; en: string }[] = [
  { key: "new", fr: "Reçue", en: "Received" },
  { key: "in_progress", fr: "En confection", en: "Being made" },
  { key: "ready_for_pickup", fr: "Prête", en: "Ready" },
  { key: "finished_delivered", fr: "Livrée", en: "Delivered" },
];

export default function CommandeDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [order, setOrder] = useState<Awaited<ReturnType<typeof TailorApi.order>> | null>(null);
  const [info, setInfo] = useState<OrderClient | null>(null);
  const [reason, setReason] = useState("");
  const [showRefuse, setShowRefuse] = useState(false);
  const [price, setPrice] = useState("");
  const [dispute, setDispute] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [carnetId, setCarnetId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const o = await TailorApi.order(id);
      setOrder(o);
      TailorApi.orderClient(id).then(setInfo).catch(() => setInfo(null));
    } catch (e) {
      setError(e instanceof Error ? e.message : tr("Chargement impossible.", "Could not load."));
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(fn: () => Promise<unknown>) {
    setError("");
    setBusy(true);
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : tr("Action impossible.", "Action failed."));
    } finally {
      setBusy(false);
    }
  }

  /** Copie le numero : certains telephones ne remplissent pas le composeur. */
  async function copyPhone(phone: string) {
    const copied = await copyText(phone);
    setNotice(copied ? tr(`Numéro ${phone} copié.`, `Number ${phone} copied.`) : "");
  }

  async function saveContact(name: string, phone: string) {
    await copyPhone(phone);
    openNewContact(name, phone);
  }

  /** Range le client dans le carnet (idempotent) et renvoie sa fiche. */
  async function toNotebook(): Promise<string | null> {
    if (!id) return null;
    const r = await TailorApi.addOrderToNotebook(id);
    setCarnetId(r.client_id);
    setNotice(
      r.created
        ? tr(`${r.name} ajouté au carnet.`, `${r.name} added to your clients.`)
        : r.measurement_copied
          ? tr(`Mesures de ${r.name} mises à jour.`, `${r.name}'s measurements updated.`)
          : tr(`${r.name} est déjà dans le carnet.`, `${r.name} is already in your clients.`)
    );
    return r.client_id;
  }

  async function createJob() {
    if (!order || !info) return;
    setBusy(true);
    setError("");
    try {
      const clientId = carnetId ?? (await toNotebook());
      if (!clientId) return;
      await TailorApi.createJob({
        tailor_client_id: clientId,
        client_name: info.name,
        description: `${info.model?.name ?? tr("Vêtement sur mesure", "Made-to-measure garment")} — ${tr("commande Sur-MeZur n°", "Sur-MeZur order no.")} ${order.id.slice(0, 6).toUpperCase()}`,
        ...(order.desired_date ? { due_date: order.desired_date } : {}),
        ...(order.agreed_price != null ? { price: Number(order.agreed_price) } : {}),
        garment_model_id: order.garment_model_id,
      });
      router.push("/tailleur/travaux");
    } catch (e) {
      setError(e instanceof Error ? e.message : tr("Création impossible.", "Could not create."));
    } finally {
      setBusy(false);
    }
  }

  if (!order) {
    return (
      <>
        <PageHeader title={tr("Commande", "Order")} back />
        {error ? <ErrorBanner message={error} /> : <Spinner />}
      </>
    );
  }

  const stepIndex = TRACKER.findIndex((t) => t.key === order.status);
  const activeStep = stepIndex === -1 ? TRACKER.length : stepIndex;
  const priceErr = amountError(price);
  const reference = order.id.slice(0, 6).toUpperCase();

  return (
    <div className="tPage">
      <PageHeader title={`${tr("Commande", "Order")} n° ${reference}`} back />
      <ErrorBanner message={error} />
      <div>
        <OrderBadge status={order.status} />
      </div>

      <ol className="tTracker" aria-label={tr("Suivi", "Progress")}>
        {TRACKER.map((step, i) => (
          <li key={step.key} className={i < activeStep ? "tTrackerDone" : i === activeStep ? "tTrackerNow" : ""}>
            <span className="tTrackerDot" aria-hidden>✓</span>
            {tr(step.fr, step.en)}
          </li>
        ))}
      </ol>

      {info && (
        <Card>
          <p style={{ margin: 0 }}>
            <strong>{info.name}</strong>
            <br />
            <span className="tRowSub">{[info.phone, info.city].filter(Boolean).join(" · ") || tr("Aucun numéro", "No number")}</span>
          </p>
          <div className="tActionRow" style={{ marginTop: 10 }}>
            {info.phone && (
              <>
                <a
                  className="btn btnSecondary"
                  href={`tel:${info.phone.replace(/[^\d+]/g, "")}`}
                  onClick={() => void copyPhone(info.phone as string)}
                >
                  <IconCall size={18} aria-hidden /> {tr("Appeler", "Call")}
                </a>
                <a
                  className="btn btnWhatsapp"
                  href={whatsappHref(info.phone, tr(`Bonjour ${info.name}, j'ai bien reçu votre commande n° ${reference} sur Sur-MeZur.`, `Hello ${info.name}, I've received your order no. ${reference} on Sur-MeZur.`))}
                >
                  <IconChat size={18} aria-hidden /> WhatsApp
                </a>
                <button type="button" className="btn btnSecondary" onClick={() => void saveContact(info.name, info.phone as string)}>
                  <IconContact size={18} aria-hidden /> {tr("Enregistrer le contact", "Save contact")}
                </button>
              </>
            )}
            <Button variant="secondary" onClick={() => void act(toNotebook)} disabled={busy}>
              <IconUsers size={18} aria-hidden /> {tr("Ajouter au carnet", "Add to clients")}
            </Button>
          </div>
          {carnetId && (
            <p className="tRowSub" style={{ margin: "8px 0 0" }}>
              <Link href={`/tailleur/clients/${carnetId}`}>{tr("Ouvrir sa fiche", "Open client")}</Link>
            </p>
          )}
        </Card>
      )}
      {notice && <p className="tNotice" role="status">{notice}</p>}

      <Card>
        <p style={{ margin: 0 }}>
          <strong>{tr("Modèle", "Style")} :</strong> {info?.model ? info.model.name : order.garment_model_id ? "…" : tr("Libre", "Free choice")}
          <br />
          <span className="tRowSub">
            {formatDateFR(order.created_at)}
            {order.desired_date ? ` · ${tr("pour le", "for")} ${formatDateFR(order.desired_date)}` : ""}
            {order.reception_mode ? ` · ${order.reception_mode === "pickup" ? tr("Retrait", "Pick-up") : tr("Livraison", "Delivery")}` : ""}
          </span>
        </p>
        {info?.model?.photo_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={info.model.photo_url} alt={info.model.name} style={{ marginTop: 10, maxWidth: 160, borderRadius: 10 }} />
        )}
        {order.budget_amount != null && (
          <p className="tRowSub" style={{ margin: "6px 0 0" }}>{tr("Budget du client", "Client's budget")} : {formatFcfa(order.budget_amount)}</p>
        )}
        {order.agreed_price != null && (
          <p style={{ margin: "6px 0 0" }}>
            {tr("Prix convenu", "Agreed price")} : <strong>{formatFcfa(order.agreed_price)}</strong>
          </p>
        )}
        {order.client_notes && (
          <p className="tRowSub" style={{ margin: "6px 0 0", whiteSpace: "pre-line" }}>{tr("Message", "Message")} : {order.client_notes}</p>
        )}
      </Card>

      {info?.measurement && (
        <Card>
          <strong>{tr("Mesures du client", "Client's measurements")}</strong>
          {info.measurement.height_cm != null && <span className="tRowSub"> · {info.measurement.height_cm} cm</span>}
          {presentableGroups(info.measurement.data).map((group) => (
            <div key={group.id}>
              <p className="tRowSub" style={{ margin: "8px 0 4px" }}>{group.title}</p>
              {group.items.map(({ key, info: mesure, value }) => (
                <p key={key} style={{ margin: "2px 0" }}>
                  {mesure.label} : <strong>{formatCm(value)}</strong>
                </p>
              ))}
            </div>
          ))}
        </Card>
      )}

      {order.status === "new" && (
        <Card>
          <label className="field">
            <span className="fieldLabel">{tr("Prix convenu FCFA (facultatif)", "Agreed price FCFA (optional)")}</span>
            <Input
              inputMode="numeric"
              value={price}
              onChange={(e) => setPrice(e.target.value.replace(/[\s.]/g, ""))}
              placeholder={order.budget_amount != null ? String(order.budget_amount) : "15000"}
              aria-invalid={priceErr ? true : undefined}
            />
            {priceErr && <span className="fieldError">{priceErr}</span>}
          </label>
          <div className="tActionRow">
            <Button
              onClick={() => void act(() => TailorApi.acceptOrder(order.id, price ? Number(price) : undefined))}
              disabled={busy || Boolean(priceErr)}
            >
              {tr("Accepter", "Accept")}
            </Button>
            <Button variant="secondary" onClick={() => setShowRefuse((s) => !s)}>
              {tr("Refuser", "Decline")}
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
                <span className="fieldLabel">{tr("Motif du refus", "Reason")}</span>
                <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={tr("Ex. délai trop court", "E.g. not enough time")} />
              </label>
              <Button type="submit" variant="danger" block disabled={reason.trim().length < 3 || busy}>
                {tr("Confirmer le refus", "Confirm")}
              </Button>
            </form>
          )}
        </Card>
      )}

      {order.status === "in_progress" && info && (
        <Button block variant="secondary" onClick={() => void createJob()} disabled={busy}>
          {tr("Créer le travail", "Create job")}
        </Button>
      )}
      {order.status === "in_progress" && (
        <Button block onClick={() => void act(() => TailorApi.setOrderStatus(order.id, "ready_for_pickup"))} disabled={busy}>
          {tr("Marquer prête", "Mark ready")}
        </Button>
      )}
      {order.status === "ready_for_pickup" && (
        <Button block onClick={() => void act(() => TailorApi.setOrderStatus(order.id, "finished_delivered"))} disabled={busy}>
          {tr("Marquer livrée", "Mark delivered")}
        </Button>
      )}

      {order.dispute_status === null && (
        <details>
          <summary className="authLink">{tr("Signaler un problème", "Report a problem")}</summary>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (dispute.trim()) void act(() => OrdersApi.openDispute(order.id, dispute.trim()));
            }}
            style={{ marginTop: 8 }}
          >
            <Textarea rows={2} value={dispute} onChange={(e) => setDispute(e.target.value)} placeholder={tr("Décrivez le problème…", "Describe the problem…")} />
            <div style={{ marginTop: 8 }}>
              <Button type="submit" variant="secondary" disabled={dispute.trim().length < 3 || busy}>
                {tr("Signaler", "Report")}
              </Button>
            </div>
          </form>
        </details>
      )}
    </div>
  );
}
