"use client";

// Paiements (M6) : code conserve, masque du menu quand payments=false.
// Journal, relances, echecs, versements aux tailleurs, remboursements,
// rapprochement operateur, recus, releve mensuel.

import Link from "next/link";
import { useState } from "react";
import { Payments, type PaymentRow } from "@/lib/api/admin";
import { Button } from "@/components/ui";
import { useAdmin } from "@/components/admin/AdminContext";
import { useFeedback } from "@/components/admin/Feedback";
import {
  DataTable,
  FilterDate,
  FilterSelect,
  FilterText,
  TABLE_DEFAULTS,
  filtersOf,
  tableQuery,
  useUrlState,
  type Column,
} from "@/components/admin/DataTable";
import { ErrorState, Loading, PageHead, Panel, StatusBadge, useLoad } from "@/components/admin/kit";
import { PAYMENT_STATUS, formatDate, formatFcfa } from "@/components/admin/format";

const TABS = ["journal", "versements", "remboursements", "rapprochement", "releve"] as const;
const TAB_LABEL: Record<string, string> = {
  journal: "Journal",
  versements: "Versements",
  remboursements: "Remboursements",
  rapprochement: "Rapprochement",
  releve: "Relevé mensuel",
};

export default function PaymentsPage() {
  const { features } = useAdmin();
  const [s, set] = useUrlState({ ...TABLE_DEFAULTS, tab: "journal", q: "", status: "", provider: "", phase: "", stuck: "", month: "", fee: "0.02" });
  const tab = (TABS as readonly string[]).includes(s.tab) ? s.tab : "journal";

  if (!features.payments) {
    return (
      <div className="adPage">
        <PageHead title="Paiements" sub="Journal des transactions et versements aux tailleurs." />
        <Panel title="Paiements désactivés">
          <p>
            Les paiements sont <strong>désactivés</strong> : aucune transaction ne passe par la
            plateforme, et les prix affichés sont de simples informations. Le code de cet
            écran est conservé : il redeviendra utile quand les paiements seront rallumés
            dans les réglages.
          </p>
          <p><Link href="/admin/reglages">Voir les réglages</Link></p>
        </Panel>
      </div>
    );
  }

  return (
    <div className="adPage">
      <PageHead title="Paiements" sub="Journal, versements, remboursements, rapprochement." actions={<Link className="btn btnSecondary adBtnSm" href="/admin/commission">Paliers de commission</Link>} />
      <div className="adTabs" role="tablist">
        {TABS.map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={`adTab ${tab === t ? "adTabActive" : ""}`} onClick={() => set({ tab: t })}>
            {TAB_LABEL[t]}
          </button>
        ))}
      </div>
      {tab === "journal" && <JournalTab s={s} set={set} />}
      {tab === "versements" && <PayoutsTab />}
      {tab === "remboursements" && <RefundsTab />}
      {tab === "rapprochement" && <ReconcileTab />}
      {tab === "releve" && <StatementTab month={s.month} fee={s.fee} set={set} />}
    </div>
  );
}

function JournalTab({ s, set }: { s: Record<string, string>; set: (p: Partial<Record<string, string>>) => void }) {
  const { confirm, toast } = useFeedback();
  const [reload, setReload] = useState(0);

  const columns: Column<PaymentRow>[] = [
    { key: "created_at", label: "Date", sort: "created_at", render: (p) => formatDate(p.created_at) },
    { key: "order_ref", label: "Commande", render: (p) => <Link href={`/admin/commandes/${p.order_id}`}>{p.order_ref}</Link> },
    { key: "client_name", label: "Client", render: (p) => p.client_name ?? "—" },
    { key: "phase_label", label: "Phase", render: (p) => p.phase_label },
    { key: "provider_label", label: "Opérateur", render: (p) => p.provider_label },
    { key: "amount", label: "Montant", align: "right", render: (p) => formatFcfa(p.amount) },
    { key: "status", label: "Statut", render: (p) => <StatusBadge map={PAYMENT_STATUS} value={p.status} /> },
    {
      key: "actions",
      label: "Actions",
      render: (p) => (
        <span className="adRow">
          <Link className="btn btnSecondary adBtnSm" href={`/admin/paiements/recu/${p.id}`}>Reçu</Link>
          {p.status === "pending" && <Button variant="secondary" className="adBtnSm" onClick={() => void remind(p.id)}>Relancer</Button>}
          {(p.status === "pending" || p.status === "failed") && (
            <Button variant="secondary" className="adBtnSm" onClick={() => void mark(p.id, "paid")}>Marquer payé</Button>
          )}
        </span>
      ),
    },
  ];

  const remind = async (id: string) => {
    try {
      await Payments.remind(id);
      toast("Relance envoyée.");
    } catch (e) {
      toast((e as Error).message, { error: true });
    }
  };

  const mark = async (id: string, status: "paid" | "failed") => {
    const reason = await confirm({ title: status === "paid" ? "Marquer ce paiement « payé » ?" : "Marquer ce paiement en échec ?", danger: status === "failed", confirmLabel: "Confirmer", reason: { label: "Motif (tracé)", required: true } });
    if (reason === null) return;
    try {
      await Payments.setStatus(id, status, reason);
      toast("Statut enregistré.");
      setReload((n) => n + 1);
    } catch (e) {
      toast((e as Error).message, { error: true });
    }
  };

  return (
    <>
      <div className="adToolbar">
        <FilterText label="Recherche" value={s.q} onChange={(q) => set({ q })} placeholder="Référence, client" wide />
        <FilterSelect label="Statut" value={s.status} onChange={(status) => set({ status })} options={{ pending: "En attente", paid: "Payés", released: "Libérés", refunded: "Remboursés", failed: "En échec" }} />
        <FilterSelect label="Opérateur" value={s.provider} onChange={(provider) => set({ provider })} options={{ mtn_momo: "MTN MoMo", orange_money: "Orange Money" }} />
        <FilterSelect label="Phase" value={s.phase} onChange={(phase) => set({ phase })} options={{ deposit_70: "Acompte", balance_30: "Solde" }} />
        <FilterSelect label="Bloqués" value={s.stuck} onChange={(stuck) => set({ stuck })} options={{ true: "En attente depuis +1 h" }} allLabel="Tous" />
        <FilterDate label="Depuis" value={s.date_from} onChange={(date_from) => set({ date_from })} />
        <FilterDate label="Jusqu'au" value={s.date_to} onChange={(date_to) => set({ date_to })} />
      </div>
      <DataTable<PaymentRow>
        id="payments"
        columns={columns}
        fetcher={(p) => Payments.table({ ...filtersOf(s, ["tab", "month", "fee"]), ...p })}
        filters={filtersOf(s, ["tab", "month", "fee"])}
        query={tableQuery(s)}
        onQuery={set}
        rowKey={(p) => p.id}
        exportPath="/admin/tables/payments"
        exportName="paiements"
        reloadToken={reload}
      />
    </>
  );
}

function PayoutsTab() {
  const { confirm, toast } = useFeedback();
  const summary = useLoad(() => Payments.payoutSummary(), []);
  const [s, set] = useUrlState({ ...TABLE_DEFAULTS });
  const [reload, setReload] = useState(0);
  const [form, setForm] = useState<{ tailor_id: string; amount: string; reference: string; note: string } | null>(null);

  return (
    <>
      {summary.error ? <ErrorState error={summary.error} onRetry={summary.reload} /> : !summary.data ? <Loading /> : (
        <Panel title="Sommes dues par tailleur">
          <ul className="adList">
            {summary.data.tailors.map((t) => (
              <li key={t.tailor_id}>
                <strong>{t.shop_name}</strong> — dû {formatFcfa(t.due_total)}, versé {formatFcfa(t.paid)}, reste {formatFcfa(t.balance)}
                {t.held_in_escrow > 0 && <span className="adHint"> · {formatFcfa(t.held_in_escrow)} séquestrés</span>}{" "}
                <button className="adLinkBtn" onClick={() => setForm({ tailor_id: t.tailor_id, amount: String(Math.round(t.balance)), reference: "", note: "" })}>enregistrer un versement</button>
              </li>
            ))}
          </ul>
          <p className="adHint">Total dû {formatFcfa(summary.data.totals.due_total)} · versé {formatFcfa(summary.data.totals.paid)} · commissions {formatFcfa(summary.data.totals.commission)}</p>
        </Panel>
      )}
      {form && (
        <Panel title="Versement manuel">
          <form
            className="adForm"
            onSubmit={async (e) => {
              e.preventDefault();
              const amount = Number(form.amount);
              if (!Number.isFinite(amount) || amount <= 0) {
                toast("Montant invalide.", { error: true });
                return;
              }
              const reason = await confirm({ title: `Enregistrer un versement de ${formatFcfa(amount)} ?`, confirmLabel: "Enregistrer", reason: { label: "Note", required: false } });
              if (reason === null) return;
              try {
                await Payments.recordPayout({ tailor_id: form.tailor_id, amount, reference: form.reference || undefined, note: [form.note, reason].filter(Boolean).join(" — ") || undefined, kind: "manual" });
                toast("Versement enregistré.");
                setForm(null);
                summary.reload();
                setReload((n) => n + 1);
              } catch (err) {
                toast((err as Error).message, { error: true });
              }
            }}
          >
            <label className="adFilter"><span>Montant (FCFA)</span><input className="input" inputMode="numeric" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required /></label>
            <label className="adFilter"><span>Référence opérateur</span><input className="input" value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} /></label>
            <label className="adFilter"><span>Note</span><input className="input" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></label>
            <span className="adRow">
              <Button variant="primary" className="adBtnSm" type="submit">Enregistrer</Button>
              <Button variant="secondary" className="adBtnSm" type="button" onClick={() => setForm(null)}>Annuler</Button>
            </span>
          </form>
        </Panel>
      )}
      <DataTable<{ id: string; tailor_id: string; shop_name: string; amount: number; kind: string; reference: string | null; order_ref: string | null; note: string | null; paid_at: string }>
        id="payouts"
        columns={[
          { key: "paid_at", label: "Date", sort: "paid_at", render: (r) => formatDate(r.paid_at) },
          { key: "shop_name", label: "Tailleur", render: (r) => r.shop_name },
          { key: "amount", label: "Montant", align: "right", render: (r) => formatFcfa(r.amount) },
          { key: "kind", label: "Type", render: (r) => r.kind },
          { key: "reference", label: "Référence", render: (r) => r.reference ?? "—" },
          { key: "note", label: "Note", optional: true, render: (r) => r.note ?? "—" },
        ]}
        fetcher={(p) => Payments.payouts({ ...filtersOf(s), ...p })}
        filters={filtersOf(s)}
        query={tableQuery(s)}
        onQuery={set}
        rowKey={(r) => r.id}
        exportPath="/admin/tables/payouts"
        exportName="versements"
        reloadToken={reload}
      />
    </>
  );
}

function RefundsTab() {
  const { confirm, toast } = useFeedback();
  const [s, set] = useUrlState({ ...TABLE_DEFAULTS, status: "" });
  const [reload, setReload] = useState(0);

  const advance = async (id: string, status: "completed" | "failed" | "cancelled") => {
    const reason = await confirm({ title: `Passer ce remboursement à « ${status} » ?`, danger: status === "failed", confirmLabel: "Appliquer", reason: { label: "Référence opérateur / motif", required: status !== "completed" } });
    if (reason === null) return;
    try {
      await Payments.refundStatus(id, status, reason || undefined);
      toast("Remboursement mis à jour.");
      setReload((n) => n + 1);
    } catch (e) {
      toast((e as Error).message, { error: true });
    }
  };

  return (
    <>
      <div className="adToolbar">
        <FilterSelect label="Statut" value={s.status} onChange={(status) => set({ status })} options={{ pending: "À effectuer", completed: "Effectués", failed: "En échec", cancelled: "Annulés" }} />
      </div>
      <DataTable<{ id: string; order_id: string; order_ref: string; amount: number; origin: string; reason: string; status: string; provider_ref: string | null; created_at: string; completed_at: string | null }>
        id="refunds"
        columns={[
          { key: "created_at", label: "Créé le", sort: "created_at", render: (r) => formatDate(r.created_at) },
          { key: "order_ref", label: "Commande", render: (r) => <Link href={`/admin/commandes/${r.order_id}`}>{r.order_ref}</Link> },
          { key: "amount", label: "Montant", align: "right", render: (r) => formatFcfa(r.amount) },
          { key: "origin", label: "Origine", render: (r) => r.origin },
          { key: "status", label: "Statut", render: (r) => r.status },
          {
            key: "actions",
            label: "Actions",
            render: (r) =>
              r.status === "pending" ? (
                <span className="adRow">
                  <Button variant="secondary" className="adBtnSm" onClick={() => void advance(r.id, "completed")}>Effectué</Button>
                  <Button variant="danger" className="adBtnSm" onClick={() => void advance(r.id, "failed")}>Échec</Button>
                </span>
              ) : null,
          },
        ]}
        fetcher={(p) => Payments.refunds({ ...filtersOf(s), ...p })}
        filters={filtersOf(s)}
        query={tableQuery(s)}
        onQuery={set}
        rowKey={(r) => r.id}
        exportPath="/admin/tables/refunds"
        exportName="remboursements"
        reloadToken={reload}
      />
    </>
  );
}

function ReconcileTab() {
  const { toast } = useFeedback();
  const [file, setFile] = useState<File | null>(null);
  const [report, setReport] = useState<Awaited<ReturnType<typeof Payments.reconcile>> | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Panel title="Rapprochement avec le relevé opérateur">
      <p className="adHint">Déposez le relevé (CSV) : les écarts avec les paiements enregistrés sont listés.</p>
      <form
        className="adRow"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!file) return;
          setBusy(true);
          try {
            setReport(await Payments.reconcile(file));
          } catch (err) {
            toast((err as Error).message, { error: true });
          } finally {
            setBusy(false);
          }
        }}
      >
        <input type="file" accept=".csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <Button variant="primary" className="adBtnSm" type="submit" disabled={!file || busy}>Rapprocher</Button>
      </form>
      {report && (
        <div>
          <p>{report.lines} ligne(s), {report.matched} rapprochée(s).</p>
          {report.mismatched.length > 0 && (
            <>
              <h4>Montants différents ({report.mismatched.length})</h4>
              <ul className="adList">{report.mismatched.map((m) => <li key={m.payment_id}>{m.reference} : plateforme {formatFcfa(m.platform_amount)} vs opérateur {formatFcfa(m.operator_amount)}</li>)}</ul>
            </>
          )}
          {report.unknown.length > 0 && (
            <>
              <h4>Inconnus côté plateforme ({report.unknown.length})</h4>
              <ul className="adList">{report.unknown.map((m, i) => <li key={i}>{m.reference} : {formatFcfa(m.amount)} le {m.date ?? "—"}</li>)}</ul>
            </>
          )}
          {report.missing_in_statement.length > 0 && (
            <>
              <h4>Absents du relevé ({report.missing_in_statement.length})</h4>
              <ul className="adList">{report.missing_in_statement.map((m) => <li key={m.payment_id}>{m.reference} : {formatFcfa(m.amount)}</li>)}</ul>
            </>
          )}
        </div>
      )}
    </Panel>
  );
}

function StatementTab({ month, fee, set }: { month: string; fee: string; set: (p: Partial<Record<string, string>>) => void }) {
  const m = month || new Date().toISOString().slice(0, 7);
  const rate = Number(fee) || 0;
  const stmt = useLoad(() => Payments.statement(m, rate), [m, fee]);
  return (
    <Panel title="Relevé mensuel">
      <div className="adToolbar">
        <label className="adFilter">
          <span>Mois</span>
          <input className="input" type="month" value={m} onChange={(e) => set({ month: e.target.value })} />
        </label>
        <label className="adFilter">
          <span>Frais opérateur (part)</span>
          <input className="input" inputMode="decimal" value={fee} onChange={(e) => set({ fee: e.target.value })} placeholder="0.02" />
        </label>
        <Button variant="secondary" className="adBtnSm" onClick={() => Payments.statementCsv(m, rate)}>Télécharger (CSV)</Button>
      </div>
      {stmt.error ? <ErrorState error={stmt.error} onRetry={stmt.reload} /> : !stmt.data ? <Loading /> : (
        <>
          <dl>
            <div className="adKv"><dt>Encaissé</dt><dd>{formatFcfa(stmt.data.summary.cash_in)}</dd></div>
            <div className="adKv"><dt>Commissions</dt><dd>{formatFcfa(stmt.data.summary.commission)}</dd></div>
            <div className="adKv"><dt>Frais opérateur</dt><dd>{formatFcfa(stmt.data.summary.operator_fees)}</dd></div>
            <div className="adKv"><dt>Versements</dt><dd>{formatFcfa(stmt.data.summary.payouts)}</dd></div>
            <div className="adKv"><dt>Remboursements</dt><dd>{formatFcfa(stmt.data.summary.refunds)}</dd></div>
            <div className="adKv"><dt>Net</dt><dd><strong>{formatFcfa(stmt.data.summary.net)}</strong></dd></div>
          </dl>
          <ul className="adList">
            {stmt.data.lines.map((l, i) => (
              <li key={i}>{l.date} · {l.type} · {l.reference}{l.order_ref ? ` (${l.order_ref})` : ""} : {formatFcfa(l.amount)}</li>
            ))}
          </ul>
        </>
      )}
    </Panel>
  );
}
