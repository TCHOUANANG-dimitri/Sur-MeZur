"use client";

/**
 * Envoyer ses mesures a un tailleur, avec le modele choisi le cas echeant.
 *
 * C'est une COMMANDE Sur-MeZur (`POST /orders`) : le tailleur la recoit dans
 * « Commandes », avec les mesures et le modele. Aucun paiement : le budget
 * est indicatif, le prix se fixe avec le tailleur.
 *
 * Modeles proposes : la selection « Mes modeles » (gardee dans le
 * navigateur) puis les favoris du compte ; `?modele=<id>` (venu de la fiche
 * d'un modele) le preselectionne.
 */

import { tr } from "@/lib/i18n";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { CatalogApi, MeasurementsApi, OrdersApi, TailorsApi } from "@/lib/api/endpoints";
import type { GarmentModel, Measurement, Order, TailorContact, TailorProfile } from "@/lib/api/types";
import { RequireRole } from "@/components/RequireRole";
import { Button, Card, EmptyState, ErrorBanner, Input, PageHeader, Spinner, Textarea } from "@/components/ui";
import { IconChat, IconCheck, IconMeasure } from "@/components/icons";
import { presentableMeasures } from "@/lib/measurements";
import { getSelection } from "@/lib/selection";
import { whatsappHref } from "@/lib/contact";
import { tailorWhatsappMessage } from "@/lib/tailors";
import { amountError, todayISO } from "@/lib/validation";

const NOTE_MAX = 2000;

function CommanderInner() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const modeleParam = params.get("modele");
  const [tailor, setTailor] = useState<TailorProfile | null>(null);
  const [measures, setMeasures] = useState<Measurement[] | null>(null);
  const [models, setModels] = useState<GarmentModel[]>([]);
  const [measurementId, setMeasurementId] = useState("");
  const [modelId, setModelId] = useState(modeleParam ?? "");
  const [reception, setReception] = useState<"pickup" | "delivery">("pickup");
  const [date, setDate] = useState("");
  const [budget, setBudget] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<Order | null>(null);
  const [contact, setContact] = useState<TailorContact | null>(null);

  useEffect(() => {
    if (!id) return;
    TailorsApi.get(id).then(setTailor).catch((e) => setError(e instanceof Error ? e.message : tr("Tailleur introuvable.", "Tailor not found.")));
    TailorsApi.contact(id).then(setContact).catch(() => setContact(null));
    MeasurementsApi.list()
      .then((list) => {
        setMeasures(list);
        const active = list.find((m) => m.is_active) ?? list[0];
        if (active) setMeasurementId(active.id);
      })
      .catch(() => setMeasures([]));
  }, [id]);

  // Modeles : selection, favoris, et celui de la fiche d'ou l'on vient.
  useEffect(() => {
    const ids = new Set<string>(getSelection());
    if (modeleParam) ids.add(modeleParam);
    Promise.all([
      Promise.all([...ids].map((m) => CatalogApi.model(m).catch(() => null))),
      CatalogApi.models({ liked_only: true, limit: 30 }).catch(() => [] as GarmentModel[]),
    ]).then(([chosen, liked]) => {
      const seen = new Set<string>();
      const out: GarmentModel[] = [];
      for (const m of [...chosen, ...liked]) {
        if (m && !seen.has(m.id)) {
          seen.add(m.id);
          out.push(m);
        }
      }
      setModels(out);
    });
  }, [modeleParam]);

  const today = todayISO();
  const dateErr = date && date < today ? tr("Date passée.", "Date in the past.") : null;
  const budgetErr = amountError(budget);
  const canSend = Boolean(measurementId) && !dateErr && !budgetErr && note.length <= NOTE_MAX && !busy;

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!canSend || !id) return;
    setError("");
    setBusy(true);
    try {
      const order = await OrdersApi.create({
        tailor_id: id,
        measurement_id: measurementId,
        ...(modelId ? { garment_model_id: modelId } : {}),
        reception_mode: reception,
        ...(date ? { desired_date: date } : {}),
        ...(budget ? { budget_amount: Number(budget) } : {}),
        ...(note.trim() ? { client_notes: note.trim() } : {}),
      });
      setSent(order);
      window.scrollTo({ top: 0 });
    } catch (err) {
      setError(err instanceof Error ? err.message : tr("Envoi impossible.", "Could not send."));
    } finally {
      setBusy(false);
    }
  }

  if (!tailor || measures === null) {
    return (
      <>
        <PageHeader title={tr("Envoyer mes mesures", "Send my measurements")} back />
        <div className="container section">{error ? <ErrorBanner message={error} /> : <Spinner />}</div>
      </>
    );
  }

  if (sent) {
    const model = models.find((m) => m.id === sent.garment_model_id);
    return (
      <>
        <PageHeader title={tr("Commande envoyée", "Order sent")} />
        <div className="container section stack">
          <EmptyState
            icon={<IconCheck size={30} strokeWidth={1.8} />}
            title={tr(`Envoyée à ${tailor.shop_name}`, `Sent to ${tailor.shop_name}`)}
            body={tr(
              `N° ${sent.id.slice(0, 6).toUpperCase()}${model ? ` · ${model.name}` : ""}. Le tailleur fixera le prix avec vous.`,
              `No. ${sent.id.slice(0, 6).toUpperCase()}${model ? ` · ${model.name}` : ""}. The tailor will agree the price with you.`
            )}
          />
          {contact?.phone && (
            <a className="btn btnWhatsapp btnBlock" href={whatsappHref(contact.phone, tailorWhatsappMessage(tailor.shop_name, sent.id))}>
              <IconChat size={18} aria-hidden /> {tr("Prévenir sur WhatsApp", "Tell them on WhatsApp")}
            </a>
          )}
          <Link href={`/commandes/${sent.id}`} style={{ display: "contents" }}>
            <Button block variant={contact?.phone ? "secondary" : "primary"}>{tr("Voir ma commande", "View my order")}</Button>
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader title={tr("Envoyer mes mesures", "Send my measurements")} back />
      <form className="container section stack" onSubmit={send} noValidate>
        <p className="muted" style={{ margin: 0 }}>
          {tr("À", "To")} <strong>{tailor.shop_name}</strong>
        </p>
        <ErrorBanner message={error} />

        {measures.length === 0 ? (
          <EmptyState
            icon={<IconMeasure size={30} strokeWidth={1.6} />}
            title={tr("Prenez d'abord vos mesures", "Take your measurements first")}
            action={
              <Link href="/mesures/nouvelle">
                <Button>{tr("Prendre mes mesures", "Take my measurements")}</Button>
              </Link>
            }
          />
        ) : (
          <>
            <fieldset className="tPick">
              <legend>{tr("Mesures", "Measurements")}</legend>
              {measures.map((m) => {
                const count = presentableMeasures(m.data as Record<string, number>).length;
                return (
                  <label key={m.id} className="tPickItem">
                    <input type="radio" name="mesure" value={m.id} checked={measurementId === m.id} onChange={() => setMeasurementId(m.id)} />
                    <span>
                      <strong>{tr("Mesures n°", "Measurements #")}{m.version}</strong>
                      {m.is_active && tr(" (actuelles)", " (current)")}
                      <br />
                      <span className="tRowSub">
                        {count} · {m.height_cm} cm
                      </span>
                    </span>
                  </label>
                );
              })}
            </fieldset>

            <fieldset className="tPick">
              <legend>{tr("Modèle (facultatif)", "Style (optional)")}</legend>
              <label className="tPickItem">
                <input type="radio" name="modele" value="" checked={!modelId} onChange={() => setModelId("")} />
                <span>{tr("Aucun modèle", "No style")}</span>
              </label>
              {models.map((m) => (
                <label key={m.id} className="tPickItem">
                  <input type="radio" name="modele" value={m.id} checked={modelId === m.id} onChange={() => setModelId(m.id)} />
                  {m.photo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="tPickThumb" src={m.photo_url} alt="" />
                  ) : (
                    <span className="tPickThumb" style={{ background: m.thumbnail_color }} aria-hidden />
                  )}
                  <span>
                    <strong>{m.name}</strong>
                    <br />
                    <span className="tRowSub">{m.category?.name}</span>
                  </span>
                </label>
              ))}
              {models.length === 0 && (
                <p className="fieldHint" style={{ margin: 0 }}>
                  <Link href="/modeles">{tr("Choisir dans le catalogue", "Choose from the catalogue")}</Link>
                </p>
              )}
            </fieldset>

            <Card>
              <label className="field">
                <span className="fieldLabel">{tr("Réception", "Collection")}</span>
                <select className="input" value={reception} onChange={(e) => setReception(e.target.value as "pickup" | "delivery")}>
                  <option value="pickup">{tr("Retrait à l'atelier", "Pick-up at the workshop")}</option>
                  <option value="delivery">{tr("Livraison", "Delivery")}</option>
                </select>
              </label>
              <label className="field">
                <span className="fieldLabel">{tr("Date souhaitée (facultatif)", "Wanted by (optional)")}</span>
                <Input type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} aria-invalid={dateErr ? true : undefined} />
                {dateErr && <span className="fieldError">{dateErr}</span>}
              </label>
              <label className="field">
                <span className="fieldLabel">{tr("Budget FCFA (facultatif)", "Budget FCFA (optional)")}</span>
                <Input
                  inputMode="numeric"
                  value={budget}
                  onChange={(e) => setBudget(e.target.value.replace(/[\s.]/g, ""))}
                  placeholder="20000"
                  aria-invalid={budgetErr ? true : undefined}
                />
                {budgetErr && <span className="fieldError">{budgetErr}</span>}
              </label>
              <label className="field" style={{ marginBottom: 0 }}>
                <span className="fieldLabel">{tr("Message (facultatif)", "Message (optional)")}</span>
                <Textarea
                  rows={3}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={NOTE_MAX}
                  placeholder={tr("Tissu, occasion…", "Fabric, occasion…")}
                />
              </label>
            </Card>

            <div className="actionBar">
              <Button type="submit" block disabled={!canSend}>
                {busy ? tr("Envoi…", "Sending…") : tr("Envoyer au tailleur", "Send to tailor")}
              </Button>
            </div>
          </>
        )}
      </form>
    </>
  );
}

export default function Commander() {
  return (
    <RequireRole role="client">
      <Suspense fallback={<Spinner />}>
        <CommanderInner />
      </Suspense>
    </RequireRole>
  );
}
