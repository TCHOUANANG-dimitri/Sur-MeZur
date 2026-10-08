"use client";

// Dossier d'une commande (M5) : chronologie (modele, mesures, messages,
// retour d'essayage, notes), annulation, changement de statut motive, saisie
// du retour d'essayage, impression.

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { Orders, type OrderDossier } from "@/lib/api/admin";
import { Button } from "@/components/ui";
import { useAdmin } from "@/components/admin/AdminContext";
import { useFeedback, Modal } from "@/components/admin/Feedback";
import { ErrorState, Loading, Notes, PageHead, Panel, StatusBadge, useLoad } from "@/components/admin/kit";
import { DISPUTE_STATUS, FIT_RESULT, ORDER_STATUS, formatDate, formatDateTime, formatFcfa, measureLabel } from "@/components/admin/format";

export default function OrderDossierPage() {
  const { id } = useParams<{ id: string }>();
  const { features } = useAdmin();
  const { confirm, toast } = useFeedback();
  const dossier = useLoad<OrderDossier>(() => Orders.dossier(id), [id]);
  const [fitOpen, setFitOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);

  if (dossier.error) return <div className="adPage"><PageHead title="Commande" back={{ href: "/admin/commandes", label: "Commandes" }} /><ErrorState error={dossier.error} onRetry={dossier.reload} /></div>;
  if (!dossier.data) return <div className="adPage"><Loading /></div>;
  const d = dossier.data;
  const o = d.order;
  const extra = o as typeof o & { budget_amount?: number | null; decline_reason?: string | null };

  const doCancel = async () => {
    const reason = await confirm({
      title: "Annuler cette commande ?",
      body: features.payments ? "Un remboursement peut être créé en même temps." : undefined,
      danger: true,
      confirmLabel: "Annuler la commande",
      reason: { label: "Motif (communiqué aux parties)", required: true },
    });
    if (reason === null) return;
    try {
      await Orders.cancel(o.id, reason);
      toast("Commande annulée.");
      dossier.reload();
    } catch (e) {
      toast((e as Error).message, { error: true });
    }
  };

  const doStatus = async () => {
    setStatusOpen(true);
  };

  return (
    <div className="adPage">
      <PageHead
        title={`Commande ${o.ref || o.id.slice(0, 8).toUpperCase()}`}
        sub={<StatusBadge map={ORDER_STATUS} value={o.status} />}
        back={{ href: "/admin/commandes", label: "Commandes" }}
        actions={
          <>
            <Button variant="secondary" className="adBtnSm adNoPrint" onClick={() => window.print()}>Imprimer</Button>
            <Button variant="secondary" className="adBtnSm adNoPrint" onClick={() => setFitOpen((v) => !v)}>Saisir un retour d&apos;essayage</Button>
            <Button variant="secondary" className="adBtnSm adNoPrint" onClick={() => void doStatus()}>Changer le statut</Button>
            {!["cancelled", "declined", "finished_delivered"].includes(o.status) && (
              <Button variant="danger" className="adBtnSm adNoPrint" onClick={() => void doCancel()}>Annuler</Button>
            )}
          </>
        }
      />

      {fitOpen && (
        <FitForm
          orderId={o.id}
          onDone={() => {
            setFitOpen(false);
            dossier.reload();
          }}
        />
      )}

      {statusOpen && (
        <StatusForm
          orderId={o.id}
          current={o.status}
          onClose={() => setStatusOpen(false)}
          onDone={() => {
            setStatusOpen(false);
            dossier.reload();
          }}
        />
      )}

      <div className="adGrid2">
        <Panel title="Commande">
          <dl>
            <div className="adKv"><dt>Client</dt><dd>{d.client ? <Link href={`/admin/utilisateurs/${d.client.id}`}>{d.client.full_name}</Link> : "—"}</dd></div>
            <div className="adKv"><dt>Tailleur</dt><dd>{d.tailor ? <Link href={`/admin/utilisateurs/${d.tailor.id}`}>{d.tailor.shop_name} ({d.tailor.full_name})</Link> : "—"}</dd></div>
            <div className="adKv"><dt>Modèle</dt><dd>{d.model ? d.model.name : d.ready_to_wear ? `Prêt-à-porter : ${d.ready_to_wear.name}` : "Sur mesure"}</dd></div>
            <div className="adKv"><dt>Tissu</dt><dd>{d.fabric ? d.fabric.name : "—"}</dd></div>
            <div className="adKv"><dt>Notes du client</dt><dd>{o.client_notes ?? "—"}</dd></div>
            <div className="adKv"><dt>Date souhaitée</dt><dd>{formatDate(o.desired_date)}</dd></div>
            <div className="adKv"><dt>Budget indicatif</dt><dd>{formatFcfa(extra.budget_amount ?? null)}</dd></div>
            <div className="adKv"><dt>Prix convenu</dt><dd>{formatFcfa(o.agreed_price)} {features.payments ? "" : "(information, sans encaissement)"}</dd></div>
            <div className="adKv"><dt>Livraison</dt><dd>{o.reception_mode === "delivery" ? `Livraison${o.delivery_fee != null ? ` (${formatFcfa(o.delivery_fee)})` : ""}` : "Retrait à l'atelier"}</dd></div>
            {extra.decline_reason ? <div className="adKv"><dt>Motif du refus</dt><dd>{extra.decline_reason}</dd></div> : null}
            {o.cancel_reason && <div className="adKv"><dt>Motif d&apos;annulation</dt><dd>{o.cancel_reason}</dd></div>}
          </dl>
        </Panel>

        <Panel title="Mensurations">
          {d.measurement ? (
            <dl className="adMeasureGrid">
              {Object.entries(d.measurement.data).map(([k, v]) => (
                <div className="adKv" key={k}><dt>{measureLabel(k)}</dt><dd>{v} cm</dd></div>
              ))}
            </dl>
          ) : (
            <p className="adHint">Aucune mesure rattachée.</p>
          )}
          {d.measurement && <p className="adHint">Prise le {formatDate(d.measurement.created_at)} · {d.measurement.source} · {d.measurement.height_cm} cm</p>}
        </Panel>
      </div>

      <Panel title="Chronologie">
        <ol className="adTimeline">
          {d.timeline.map((t, i) => (
            <li key={i}>
              <span className="adHint">{t.at ? formatDateTime(t.at) : ""}</span> <strong>{t.title}</strong>
              {t.detail && <div className="adHint">{t.detail}</div>}
            </li>
          ))}
        </ol>
      </Panel>

      {d.offers.length > 0 && (
        <Panel title={`Offres (${d.offers.length}) — inactives, négociation coupée`}>
          <ul className="adList">
            {d.offers.map((x) => (
              <li key={x.id}>{x.actor === "client" ? "Client" : "Tailleur"} : {formatFcfa(x.amount)} · manche {x.round} · {x.status}</li>
            ))}
          </ul>
        </Panel>
      )}

      {features.payments && (d.payments.length > 0 || d.split || d.refunds.length > 0) && (
        <Panel title="Paiements (archives, fonction coupée)">
          <ul className="adList">
            {d.payments.map((p) => <li key={p.id}>{p.phase} : {formatFcfa(p.amount)} · {p.status} · {p.provider}</li>)}
            {d.refunds.map((r) => <li key={r.id}>Remboursement : {formatFcfa(r.amount)} · {r.status}</li>)}
          </ul>
        </Panel>
      )}

      <Panel title={`Retours d'essayage (${d.fit_feedbacks.length})`}>
        {d.fit_feedbacks.length === 0 ? <p className="adHint">Aucun retour saisi.</p> : (
          <ul className="adList">
            {d.fit_feedbacks.map((f) => (
              <li key={f.id}>
                <strong>{FIT_RESULT[f.result] ?? f.result}</strong> ({f.source}) <span className="adHint">{formatDateTime(f.created_at)}</span>
                {f.comment && <div>{f.comment}</div>}
                {f.adjustments.length > 0 && (
                  <ul>{f.adjustments.map((a, i) => <li key={i}>{measureLabel(a.measure)} : {a.delta_cm > 0 ? "+" : ""}{a.delta_cm} cm{a.note ? ` — ${a.note}` : ""}</li>)}</ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {d.review && (
        <Panel title="Avis du client">
          <p>{d.review.stars}★ — {d.review.comment ?? "sans commentaire"}</p>
        </Panel>
      )}

      {d.dispute_messages.length > 0 && (
        <Panel title="Échanges du litige">
          <ul className="adList">
            {d.dispute_messages.map((m) => (
              <li key={m.id}>
                <strong>{m.author_name}</strong> <span className="adHint">({m.author_role} → {m.audience}) · {formatDateTime(m.created_at)}</span>
                <div>{m.body}</div>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Notes entityType="order" entityId={o.id} />
    </div>
  );
}

function StatusForm({ orderId, current, onClose, onDone }: { orderId: string; current: string; onClose: () => void; onDone: () => void }) {
  const { toast } = useFeedback();
  const [status, setStatus] = useState(current);
  const [reason, setReason] = useState("");
  return (
    <Modal
      title="Changer le statut (correction)"
      onClose={onClose}
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>Annuler</Button>
          <Button
            variant="primary"
            disabled={reason.trim().length < 3}
            onClick={async () => {
              try {
                await Orders.forceStatus(orderId, status, reason.trim());
                toast("Statut changé.");
                onDone();
              } catch (err) {
                toast((err as Error).message, { error: true });
              }
            }}
          >
            Changer
          </Button>
        </>
      }
    >
      <p className="adHint">Réservé aux corrections et rattrapages (l&apos;atelier avance normalement la commande depuis son espace).</p>
      <label className="adFilter">
        <span>Nouveau statut</span>
        <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
          {Object.entries(ORDER_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </label>
      <label className="adFilter">
        <span>Motif (obligatoire, tracé)</span>
        <textarea className="input adTextarea" value={reason} onChange={(e) => setReason(e.target.value)} />
      </label>
    </Modal>
  );
}

function FitForm({ orderId, onDone }: { orderId: string; onDone: () => void }) {
  const { toast } = useFeedback();
  const [result, setResult] = useState("good");
  const [comment, setComment] = useState("");
  return (
    <Panel title="Retour d'essayage">
      <form
        className="adForm adNoPrint"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await Orders.fitFeedback(orderId, { result, adjustments: [], comment: comment || undefined });
            toast("Retour enregistré.");
            onDone();
          } catch (err) {
            toast((err as Error).message, { error: true });
          }
        }}
      >
        <label className="adFilter">
          <span>Résultat</span>
          <select className="input" value={result} onChange={(e) => setResult(e.target.value)}>
            {Object.entries(FIT_RESULT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label className="adFilter">
          <span>Commentaire</span>
          <textarea className="input adTextarea" value={comment} onChange={(e) => setComment(e.target.value)} />
        </label>
        <Button variant="primary" className="adBtnSm" type="submit">Enregistrer</Button>
      </form>
    </Panel>
  );
}
