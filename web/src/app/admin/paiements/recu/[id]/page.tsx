"use client";

// Recu d'un paiement (M6) : version imprimable.

import { useParams } from "next/navigation";
import Link from "next/link";
import { Payments, type Receipt } from "@/lib/api/admin";
import { Button } from "@/components/ui";
import { ErrorState, Loading, PageHead, Panel, useLoad } from "@/components/admin/kit";
import { formatDateTime, formatFcfa } from "@/components/admin/format";

export default function ReceiptPage() {
  const { id } = useParams<{ id: string }>();
  const receipt = useLoad<Receipt>(() => Payments.receipt(id), [id]);

  if (receipt.error) return <div className="adPage"><PageHead title="Reçu" back={{ href: "/admin/paiements", label: "Paiements" }} /><ErrorState error={receipt.error} onRetry={receipt.reload} /></div>;
  if (!receipt.data) return <div className="adPage"><Loading /></div>;
  const r = receipt.data;

  return (
    <div className="adPage">
      <PageHead
        title={`Reçu ${r.number}`}
        sub={`${formatDateTime(r.date)} · ${r.status}`}
        back={{ href: "/admin/paiements", label: "Paiements" }}
        actions={<Button variant="secondary" className="adBtnSm adNoPrint" onClick={() => window.print()}>Imprimer</Button>}
      />
      <Panel title="Transaction">
        <dl>
          <div className="adKv"><dt>Montant</dt><dd><strong>{formatFcfa(r.amount)}</strong> ({r.phase})</dd></div>
          <div className="adKv"><dt>Opérateur</dt><dd>{r.provider} · réf {r.provider_txn_ref}</dd></div>
          <div className="adKv"><dt>Commande</dt><dd>{r.order_ref}{r.order_total != null ? ` (total ${formatFcfa(r.order_total)})` : ""}</dd></div>
          <div className="adKv"><dt>Client</dt><dd>{r.client ? `${r.client.name} · ${r.client.phone}` : "—"}</dd></div>
          <div className="adKv"><dt>Tailleur</dt><dd>{r.tailor ? `${r.tailor.name}${r.tailor.city ? ` · ${r.tailor.city}` : ""}` : "—"}</dd></div>
        </dl>
        <p className="adHint">Document généré par Sur-MeZur pour l&apos;équipe. <Link href="/admin/paiements">Retour aux paiements</Link>.</p>
      </Panel>
    </div>
  );
}
