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
    TailorsApi.get(id).then(setTailor).catch((e) => setError(e instanceof Error ? e.message : "Tailleur introuvable."));
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
  const dateErr = date && date < today ? "La date souhaitée ne peut pas être passée." : null;
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
      setError(err instanceof Error ? err.message : "Envoi impossible.");
    } finally {
      setBusy(false);
    }
  }

  if (!tailor || measures === null) {
    return (
      <>
        <PageHeader title="Envoyer mes mesures" back />
        <div className="container section">{error ? <ErrorBanner message={error} /> : <Spinner label="Chargement…" />}</div>
      </>
    );
  }

  if (sent) {
    const model = models.find((m) => m.id === sent.garment_model_id);
    return (
      <>
        <PageHeader title="Commande envoyée" />
        <div className="container section stack">
          <EmptyState
            icon={<IconCheck size={30} strokeWidth={1.8} />}
            title={`Envoyée à ${tailor.shop_name}`}
            body={`Commande n° ${sent.id.slice(0, 6).toUpperCase()} : vos mesures${model ? ` et le modèle « ${model.name} »` : ""} sont chez le tailleur. Il l'acceptera et fixera le prix avec vous.`}
          />
          {contact?.phone && (
            <a className="btn btnWhatsapp btnBlock" href={whatsappHref(contact.phone, tailorWhatsappMessage(tailor.shop_name, sent.id))}>
              <IconChat size={18} aria-hidden /> Prévenir le tailleur sur WhatsApp
            </a>
          )}
          <Link href={`/commandes/${sent.id}`} style={{ display: "contents" }}>
            <Button block variant={contact?.phone ? "secondary" : "primary"}>Voir ma commande</Button>
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Envoyer mes mesures" back />
      <form className="container section stack" onSubmit={send} noValidate>
        <p className="muted" style={{ margin: 0 }}>
          À <strong>{tailor.shop_name}</strong>. Le tailleur reçoit vos mesures et, si vous en choisissez un, le modèle.
        </p>
        <ErrorBanner message={error} />

        {measures.length === 0 ? (
          <EmptyState
            icon={<IconMeasure size={30} strokeWidth={1.6} />}
            title="Prenez d'abord vos mesures"
            body="Deux photos suffisent : vos douze mesures de couture en moins d'une minute."
            action={
              <Link href="/mesures/nouvelle">
                <Button>Prendre mes mesures</Button>
              </Link>
            }
          />
        ) : (
          <>
            <fieldset className="tPick">
              <legend>Fiche de mesures</legend>
              {measures.map((m) => {
                const count = presentableMeasures(m.data as Record<string, number>).length;
                return (
                  <label key={m.id} className="tPickItem">
                    <input type="radio" name="mesure" value={m.id} checked={measurementId === m.id} onChange={() => setMeasurementId(m.id)} />
                    <span>
                      <strong>Prise de mesures n°{m.version}</strong>
                      {m.is_active && " (actuelles)"}
                      <br />
                      <span className="tRowSub">
                        {count} mesure{count > 1 ? "s" : ""} · {m.height_cm} cm
                      </span>
                    </span>
                  </label>
                );
              })}
            </fieldset>

            <fieldset className="tPick">
              <legend>Modèle (facultatif)</legend>
              <label className="tPickItem">
                <input type="radio" name="modele" value="" checked={!modelId} onChange={() => setModelId("")} />
                <span>Aucun modèle : j&apos;en parlerai avec le tailleur</span>
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
                  Ajoutez des modèles depuis le <Link href="/modeles">catalogue</Link> (cœur ou « Mes modèles ») pour les envoyer.
                </p>
              )}
            </fieldset>

            <Card>
              <label className="field">
                <span className="fieldLabel">Réception</span>
                <select className="input" value={reception} onChange={(e) => setReception(e.target.value as "pickup" | "delivery")}>
                  <option value="pickup">Je passe le chercher à l&apos;atelier</option>
                  <option value="delivery">Livraison</option>
                </select>
              </label>
              <label className="field">
                <span className="fieldLabel">Date souhaitée (facultatif)</span>
                <Input type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} aria-invalid={dateErr ? true : undefined} />
                {dateErr && <span className="fieldError">{dateErr}</span>}
              </label>
              <label className="field">
                <span className="fieldLabel">Budget indicatif en FCFA (facultatif)</span>
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
                <span className="fieldLabel">Message au tailleur (facultatif)</span>
                <Textarea
                  rows={3}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={NOTE_MAX}
                  placeholder="Tissu, occasion, détails du modèle…"
                />
              </label>
            </Card>

            <div className="actionBar">
              <Button type="submit" block disabled={!canSend}>
                {busy ? "Envoi…" : "Envoyer au tailleur"}
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
      <Suspense fallback={<Spinner label="Chargement…" />}>
        <CommanderInner />
      </Suspense>
    </RequireRole>
  );
}
