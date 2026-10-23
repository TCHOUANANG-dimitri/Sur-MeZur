"use client";

/**
 * Detail d'une commande recue (B3.6) : accepter (avec le prix convenu) ou
 * refuser avec motif, suivi du statut, messagerie avec le client, modele
 * demande et mesures envoyees. Aucune offre, aucun devis, aucun paiement.
 *
 * Le client se joint comme ceux du carnet : Appeler (numero copie),
 * WhatsApp, Enregistrer dans les contacts. « Ajouter a mon carnet » le range
 * avec ses mesures (sans doublon) ; une fois la commande acceptee, « Creer le
 * travail » la reporte dans Travaux, d'ou elle alimente les recettes.
 */

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
  const router = useRouter();
  const [order, setOrder] = useState<Awaited<ReturnType<typeof TailorApi.order>> | null>(null);
  const [info, setInfo] = useState<OrderClient | null>(null);
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [message, setMessage] = useState("");
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

  /** Copie le numero : certains telephones ne remplissent pas le composeur. */
  async function copyPhone(phone: string) {
    const copied = await copyText(phone);
    setNotice(copied ? `Numéro ${phone} copié : collez-le si le téléphone ne l'a pas déjà rempli.` : "");
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
        ? `${r.name} est dans votre carnet${r.measurement_copied ? ", avec ses mesures" : ""}.`
        : r.measurement_copied
          ? `Mesures de ${r.name} mises à jour dans votre carnet.`
          : `${r.name} est déjà dans votre carnet.`
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
        description: `${info.model?.name ?? "Vêtement sur mesure"} — commande Sur-MeZur n° ${order.id.slice(0, 6).toUpperCase()}`,
        ...(order.desired_date ? { due_date: order.desired_date } : {}),
        ...(order.agreed_price != null ? { price: Number(order.agreed_price) } : {}),
        garment_model_id: order.garment_model_id,
      });
      router.push("/tailleur/travaux");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Création du travail impossible.");
    } finally {
      setBusy(false);
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
  const priceErr = amountError(price);
  const reference = order.id.slice(0, 6).toUpperCase();

  return (
    <div className="tPage">
      <PageHeader title={`Commande n° ${reference}`} back />
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

      {info && (
        <Card>
          <p style={{ margin: 0 }}>
            <strong>{info.name}</strong>
            <br />
            <span className="tRowSub">{[info.phone, info.city].filter(Boolean).join(" · ") || "Aucun numéro"}</span>
          </p>
          <div className="tActionRow" style={{ marginTop: 10 }}>
            {info.phone && (
              <>
                <a
                  className="btn btnSecondary"
                  href={`tel:${info.phone.replace(/[^\d+]/g, "")}`}
                  onClick={() => void copyPhone(info.phone as string)}
                >
                  <IconCall size={18} aria-hidden /> Appeler
                </a>
                <a
                  className="btn btnWhatsapp"
                  href={whatsappHref(info.phone, `Bonjour ${info.name}, j'ai bien reçu votre commande n° ${reference} sur Sur-MeZur.`)}
                >
                  <IconChat size={18} aria-hidden /> WhatsApp
                </a>
                <button type="button" className="btn btnSecondary" onClick={() => void saveContact(info.name, info.phone as string)}>
                  <IconContact size={18} aria-hidden /> Enregistrer dans mes contacts
                </button>
              </>
            )}
            <Button variant="secondary" onClick={() => void act(toNotebook)} disabled={busy}>
              <IconUsers size={18} aria-hidden /> Ajouter à mon carnet
            </Button>
          </div>
          {carnetId && (
            <p className="tRowSub" style={{ margin: "8px 0 0" }}>
              <Link href={`/tailleur/clients/${carnetId}`}>Ouvrir sa fiche dans le carnet</Link>
            </p>
          )}
        </Card>
      )}
      {notice && <p className="tNotice" role="status">{notice}</p>}

      <Card>
        <p style={{ margin: 0 }}>
          <strong>Modèle :</strong> {info?.model ? info.model.name : order.garment_model_id ? "…" : "Sur mesure libre"}
          <br />
          <span className="tRowSub">
            Passée le {formatDateFR(order.created_at)}
            {order.desired_date ? ` · Souhaitée le ${formatDateFR(order.desired_date)}` : ""}
            {order.reception_mode ? ` · ${order.reception_mode === "pickup" ? "Retrait" : "Livraison"}` : ""}
          </span>
        </p>
        {info?.model?.photo_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={info.model.photo_url} alt={info.model.name} style={{ marginTop: 10, maxWidth: 160, borderRadius: 10 }} />
        )}
        {order.budget_amount != null && (
          <p className="tRowSub" style={{ margin: "6px 0 0" }}>Budget indiqué par le client : {formatFcfa(order.budget_amount)}</p>
        )}
        {order.agreed_price != null && (
          <p style={{ margin: "6px 0 0" }}>
            Prix convenu : <strong>{formatFcfa(order.agreed_price)}</strong>
          </p>
        )}
        {order.client_notes && (
          <p className="tRowSub" style={{ margin: "6px 0 0", whiteSpace: "pre-line" }}>Message du client : {order.client_notes}</p>
        )}
      </Card>

      {info?.measurement && (
        <Card>
          <strong>Mesures du client</strong>
          {info.measurement.height_cm != null && <span className="tRowSub"> · taille {info.measurement.height_cm} cm</span>}
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
            <span className="fieldLabel">Prix convenu en FCFA (facultatif)</span>
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

      {order.status === "in_progress" && info && (
        <Button block variant="secondary" onClick={() => void createJob()} disabled={busy}>
          Créer le travail correspondant
        </Button>
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
            <div key={m.id} className={`tMsg ${info?.client_id && m.sender_id !== info.client_id ? "tMsgMine" : ""}`}>
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
            maxLength={2000}
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
