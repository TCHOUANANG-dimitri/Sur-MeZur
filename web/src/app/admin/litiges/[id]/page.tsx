"use client";

// Dossier d'un litige (7.2 a 7.4) : echanges avec les parties, decision
// graduee. Sans argent : « remboursement » vaut « en faveur du client ».

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { Orders, type OrderDossier } from "@/lib/api/admin";
import { Button } from "@/components/ui";
import { useAdmin } from "@/components/admin/AdminContext";
import { useFeedback, Modal } from "@/components/admin/Feedback";
import { ErrorState, Loading, Notes, PageHead, Panel, StatusBadge, useLoad } from "@/components/admin/kit";
import { DISPUTE_CATEGORY, DISPUTE_STATUS, ORDER_STATUS, formatDateTime, formatFcfa } from "@/components/admin/format";

const DECISIONS = [
  { key: "refund_full", label: "Remboursement total" },
  { key: "refund_partial", label: "Remboursement partiel" },
  { key: "alteration", label: "Retouche demandée" },
  { key: "rejected", label: "Réclamation rejetée" },
];

export default function DisputeDossierPage() {
  const { id } = useParams<{ id: string }>();
  const { features } = useAdmin();
  const dossier = useLoad<OrderDossier>(() => Orders.dossier(id), [id]);
  const [decideOpen, setDecideOpen] = useState(false);
  const [msgOpen, setMsgOpen] = useState(false);

  if (dossier.error) return <div className="adPage"><PageHead title="Litige" back={{ href: "/admin/litiges", label: "Litiges" }} /><ErrorState error={dossier.error} onRetry={dossier.reload} /></div>;
  if (!dossier.data) return <div className="adPage"><Loading /></div>;
  const d = dossier.data;
  const o = d.order;
  const open = o.dispute_status === "open";

  return (
    <div className="adPage">
      <PageHead
        title={`Litige — commande ${o.ref || o.id.slice(0, 8).toUpperCase()}`}
        sub={`${DISPUTE_CATEGORY[o.dispute_category ?? ""] ?? "—"} · ouvert le ${formatDateTime(o.dispute_opened_at)} · ${DISPUTE_STATUS[o.dispute_status ?? ""] ?? o.dispute_status ?? "—"}`}
        back={{ href: "/admin/litiges", label: "Litiges" }}
        actions={
          <>
            <Link className="btn btnSecondary adBtnSm adNoPrint" href={`/admin/commandes/${o.id}`}>Voir la commande</Link>
            {open && <Button variant="secondary" className="adBtnSm adNoPrint" onClick={() => setMsgOpen(true)}>Écrire aux parties</Button>}
            {open && <Button variant="primary" className="adBtnSm adNoPrint" onClick={() => setDecideOpen(true)}>Trancher</Button>}
          </>
        }
      />
      <div className="adGrid2">
        <Panel title="Parties">
          <p>Client : {d.client ? <Link href={`/admin/utilisateurs/${d.client.id}`}>{d.client.full_name}</Link> : "—"}</p>
          <p>Tailleur : {d.tailor ? <Link href={`/admin/utilisateurs/${d.tailor.id}`}>{d.tailor.shop_name}</Link> : "—"}</p>
          <p>Commande : <StatusBadge map={ORDER_STATUS} value={o.status} /> · prix convenu {formatFcfa(o.agreed_price)}</p>
          {o.dispute_note && <p>Motif d&apos;ouverture : {o.dispute_note}</p>}
        </Panel>
        <Panel title="Échanges">
          {d.dispute_messages.length === 0 ? <p className="adHint">Aucun échange.</p> : (
            <ul className="adList">
              {d.dispute_messages.map((m) => (
                <li key={m.id}>
                  <strong>{m.author_name}</strong> <span className="adHint">({m.author_role} → {m.audience}) · {formatDateTime(m.created_at)}</span>
                  <div>{m.body}</div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
      {msgOpen && <MessageForm orderId={o.id} onClose={() => setMsgOpen(false)} onDone={() => { setMsgOpen(false); dossier.reload(); }} />}
      {decideOpen && <DecideForm orderId={o.id} noMoney={!features.payments} onClose={() => setDecideOpen(false)} onDone={() => { setDecideOpen(false); dossier.reload(); }} />}
      <Notes entityType="order" entityId={o.id} />
    </div>
  );
}

function MessageForm({ orderId, onClose, onDone }: { orderId: string; onClose: () => void; onDone: () => void }) {
  const { toast } = useFeedback();
  const [audience, setAudience] = useState("both");
  const [body, setBody] = useState("");
  const [photo, setPhoto] = useState(false);
  return (
    <Modal
      title="Écrire aux parties"
      onClose={onClose}
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>Annuler</Button>
          <Button
            variant="primary"
            disabled={body.trim().length < 2}
            onClick={async () => {
              try {
                await Orders.disputeMessage(orderId, audience, body.trim(), photo);
                toast("Message envoyé.");
                onDone();
              } catch (e) {
                toast((e as Error).message, { error: true });
              }
            }}
          >
            Envoyer
          </Button>
        </>
      }
    >
      <label className="adFilter">
        <span>Destinataires</span>
        <select className="input" value={audience} onChange={(e) => setAudience(e.target.value)}>
          <option value="both">Les deux parties</option>
          <option value="client">Client seul</option>
          <option value="tailor">Tailleur seul</option>
        </select>
      </label>
      <label className="adFilter">
        <span>Message</span>
        <textarea className="input adTextarea" value={body} onChange={(e) => setBody(e.target.value)} />
      </label>
      <label className="adFilter">
        <span><input type="checkbox" checked={photo} onChange={(e) => setPhoto(e.target.checked)} /> Demander une photo</span>
      </label>
    </Modal>
  );
}

function DecideForm({ orderId, noMoney, onClose, onDone }: { orderId: string; noMoney: boolean; onClose: () => void; onDone: () => void }) {
  const { toast } = useFeedback();
  const [decision, setDecision] = useState("alteration");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  return (
    <Modal
      title="Trancher le litige"
      onClose={onClose}
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>Annuler</Button>
          <Button
            variant="primary"
            disabled={reason.trim().length < 3 || (decision === "refund_partial" && !noMoney && !Number(amount))}
            onClick={async () => {
              try {
                await Orders.decide(orderId, decision, reason.trim(), decision === "refund_partial" && !noMoney ? Number(amount) : null);
                toast("Décision enregistrée et communiquée.");
                onDone();
              } catch (e) {
                toast((e as Error).message, { error: true });
              }
            }}
          >
            Trancher
          </Button>
        </>
      }
    >
      <label className="adFilter">
        <span>Décision graduée</span>
        <select className="input" value={decision} onChange={(e) => setDecision(e.target.value)}>
          {DECISIONS.map((x) => <option key={x.key} value={x.key}>{x.label}{noMoney && x.key.startsWith("refund") ? " (vaut « en faveur du client », sans remboursement)" : ""}</option>)}
        </select>
      </label>
      {decision === "refund_partial" && !noMoney && (
        <label className="adFilter">
          <span>Montant (FCFA)</span>
          <input className="input" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
      )}
      <label className="adFilter">
        <span>Motif (communiqué aux deux parties)</span>
        <textarea className="input adTextarea" value={reason} onChange={(e) => setReason(e.target.value)} />
      </label>
    </Modal>
  );
}
