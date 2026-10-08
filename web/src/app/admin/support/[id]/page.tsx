"use client";

// Demande de support (12.2, 12.3) : attribution, reponse, rattachement a un
// compte ou une commande.

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { Support, type TicketDetail } from "@/lib/api/admin";
import { Button } from "@/components/ui";
import { useAdmin } from "@/components/admin/AdminContext";
import { useFeedback } from "@/components/admin/Feedback";
import { ErrorState, Loading, PageHead, Panel, StatusBadge, useLoad } from "@/components/admin/kit";
import { TICKET_STATUS, formatDateTime } from "@/components/admin/format";

export default function TicketPage() {
  const { id } = useParams<{ id: string }>();
  const { me } = useAdmin();
  const { toast } = useFeedback();
  const ticket = useLoad<TicketDetail>(() => Support.ticket(id), [id]);
  const [reply, setReply] = useState("");
  const [userId, setUserId] = useState("");
  const [orderId, setOrderId] = useState("");

  if (ticket.error) return <div className="adPage"><PageHead title="Demande" back={{ href: "/admin/support", label: "Support" }} /><ErrorState error={ticket.error} onRetry={ticket.reload} /></div>;
  if (!ticket.data) return <div className="adPage"><Loading /></div>;
  const t = ticket.data;

  const patch = async (body: Parameters<typeof Support.update>[1]) => {
    try {
      await Support.update(t.id, body);
      toast("Demande mise à jour.");
      ticket.reload();
    } catch (e) {
      toast((e as Error).message, { error: true });
    }
  };

  return (
    <div className="adPage">
      <PageHead
        title={`#${t.number} ${t.subject}`}
        sub={<StatusBadge map={TICKET_STATUS} value={t.status} />}
        back={{ href: "/admin/support", label: "Support" }}
        actions={
          <>
            {t.status !== "resolved" && <Button variant="secondary" className="adBtnSm" onClick={() => void patch({ status: "in_progress", assigned_to: me?.id ?? null })}>Prendre en charge</Button>}
            {t.status !== "resolved" && <Button variant="primary" className="adBtnSm" onClick={() => void patch({ status: "resolved" })}>Marquer résolue</Button>}
            {t.status === "resolved" && <Button variant="secondary" className="adBtnSm" onClick={() => void patch({ status: "in_progress" })}>Rouvrir</Button>}
          </>
        }
      />
      <div className="adGrid2">
        <Panel title="Demande">
          <p><strong>{t.name}</strong>{t.phone ? ` · ${t.phone}` : ""}{t.email ? ` · ${t.email}` : ""}</p>
          <p className="adHint">{t.category_label} · reçue le {formatDateTime(t.created_at)}</p>
          <p>{t.body}</p>
          {t.order_id && <p>Commande : <Link href={`/admin/commandes/${t.order_id}`}>{t.order_ref ?? t.order_id.slice(0, 8)}</Link></p>}
          {t.user_id && <p>Compte : <Link href={`/admin/utilisateurs/${t.user_id}`}>voir la fiche</Link></p>}
          {t.dispute_open && <p className="adWarn">Un litige est ouvert sur la commande liée.</p>}
        </Panel>
        <Panel title="Suivi">
          <p>Attribuée à : {t.staff.find((x) => x.id === t.assigned_to)?.full_name ?? "personne"}</p>
          <div className="adRow">
            <Button variant="secondary" className="adBtnSm" onClick={() => void patch({ assigned_to: me?.id ?? null })}>Me l&apos;attribuer</Button>
          </div>
          <form
            className="adForm"
            onSubmit={async (e) => {
              e.preventDefault();
              await patch({ user_id: userId.trim() || null, order_id: orderId.trim() || null });
              setUserId("");
              setOrderId("");
            }}
          >
            <h4>Rattacher</h4>
            <label className="adFilter"><span>Compte (id)</span><input className="input" value={userId} onChange={(e) => setUserId(e.target.value)} placeholder={t.user_id ?? "—"} /></label>
            <label className="adFilter"><span>Commande (id)</span><input className="input" value={orderId} onChange={(e) => setOrderId(e.target.value)} placeholder={t.order_id ?? "—"} /></label>
            <Button variant="secondary" className="adBtnSm" type="submit">Rattacher</Button>
          </form>
          <label className="adFilter">
            <span>Catégorie</span>
            <select className="input" value={t.category} onChange={(e) => void patch({ category: e.target.value })}>
              {Object.entries(t.categories).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
        </Panel>
      </div>
      <Panel title="Échanges">
        {t.messages.length === 0 ? <p className="adHint">Aucun message.</p> : (
          <ul className="adList">
            {t.messages.map((m) => (
              <li key={m.id}>
                <strong>{m.from_staff ? `${m.author_name} (équipe)` : m.author_name}</strong>{" "}
                <span className="adHint">{formatDateTime(m.created_at)}</span>
                <div>{m.body}</div>
              </li>
            ))}
          </ul>
        )}
        <form
          className="adForm"
          onSubmit={async (e) => {
            e.preventDefault();
            if (reply.trim().length < 2) return;
            try {
              const r = await Support.reply(t.id, reply.trim());
              toast(r.notified ? "Réponse envoyée et notifiée." : "Réponse enregistrée (visiteur : à recontacter).");
              setReply("");
              ticket.reload();
            } catch (err) {
              toast((err as Error).message, { error: true });
            }
          }}
        >
          <label className="adFilter"><span>Répondre</span><textarea className="input adTextarea" value={reply} onChange={(e) => setReply(e.target.value)} /></label>
          <Button variant="primary" className="adBtnSm" type="submit">Envoyer</Button>
        </form>
      </Panel>
    </div>
  );
}
