"use client";

// Acquisition (14.9 a 14.15) : file des nouvelles acquisitions a qualifier
// (une par une ou en lot), canaux, campagnes avec budget et cout
// d'acquisition, objectifs, generateur de liens de campagne.

import Link from "next/link";
import { useState } from "react";
import {
  Growth,
  type AcquisitionRow,
  type Campaign,
  type Channel,
  type Goal,
} from "@/lib/api/admin";
import { Button } from "@/components/ui";
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
import { ErrorState, Loading, PageHead, Panel, Progress, useLoad } from "@/components/admin/kit";
import { formatDate, formatFcfa, formatNumber } from "@/components/admin/format";

const TABS = ["file", "canaux", "campagnes", "objectifs", "liens"] as const;
const TAB_LABEL: Record<string, string> = {
  file: "À qualifier",
  canaux: "Canaux",
  campagnes: "Campagnes",
  objectifs: "Objectifs",
  liens: "Liens de campagne",
};

export default function AcquisitionPage() {
  const [s, set] = useUrlState({ ...TABLE_DEFAULTS, tab: "file" });
  const tab = (TABS as readonly string[]).includes(s.tab) ? s.tab : "file";
  return (
    <div className="adPage">
      <PageHead title="Acquisition" sub="D'où viennent les comptes, à quel coût, vers quels objectifs." />
      <div className="adTabs" role="tablist">
        {TABS.map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={`adTab ${tab === t ? "adTabActive" : ""}`} onClick={() => set({ tab: t })}>
            {TAB_LABEL[t]}
          </button>
        ))}
      </div>
      {tab === "file" && <QueueTab />}
      {tab === "canaux" && <ChannelsTab />}
      {tab === "campagnes" && <CampaignsTab />}
      {tab === "objectifs" && <GoalsTab />}
      {tab === "liens" && <LinksTab />}
    </div>
  );
}

function QualifyForm({ userId, initial, onDone }: {
  userId: string;
  initial?: { channel_id?: string | null; campaign_id?: string | null };
  onDone: () => void;
}) {
  const { toast } = useFeedback();
  const [channelId, setChannelId] = useState(initial?.channel_id ?? "");
  const [campaignId, setCampaignId] = useState(initial?.campaign_id ?? "");
  const [referrer, setReferrer] = useState("");
  const [method, setMethod] = useState("");
  const [body, setBody] = useState("");
  const channels = useLoad(() => Growth.channels(), []);
  const campaigns = useLoad(() => Growth.campaigns(), []);
  return (
    <form
      className="adForm"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await Growth.qualify(userId, {
            channel_id: channelId || null,
            campaign_id: campaignId || null,
            referrer: referrer || undefined,
            method: method || undefined,
            body: body || undefined,
          });
          toast("Acquisition qualifiée.");
          onDone();
        } catch (err) {
          toast((err as Error).message, { error: true });
        }
      }}
    >
      <div className="adRow">
        <label className="adFilter">
          <span>Canal</span>
          <select className="input" value={channelId} onChange={(e) => setChannelId(e.target.value)}>
            <option value="">—</option>
            {(channels.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="adFilter">
          <span>Campagne</span>
          <select className="input" value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
            <option value="">—</option>
            {(campaigns.data ?? []).filter((c) => !channelId || c.channel_id === channelId).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
      </div>
      <div className="adRow">
        <label className="adFilter"><span>Prescripteur</span><input className="input" value={referrer} onChange={(e) => setReferrer(e.target.value)} placeholder="Stand A, Awa…" /></label>
        <label className="adFilter"><span>Méthode</span><input className="input" value={method} onChange={(e) => setMethod(e.target.value)} placeholder="démarchage, appel…" /></label>
      </div>
      <label className="adFilter"><span>Commentaire</span><textarea className="input adTextarea" value={body} onChange={(e) => setBody(e.target.value)} /></label>
      <Button variant="primary" className="adBtnSm" type="submit">Qualifier</Button>
    </form>
  );
}

function QueueTab() {
  const { toast } = useFeedback();
  const [s, set] = useUrlState({ ...TABLE_DEFAULTS, state: "todo", role: "", channel_id: "", date_from: "", date_to: "", q: "" });
  const [reload, setReload] = useState(0);
  const [qualifyId, setQualifyId] = useState<string | null>(null);

  const columns: Column<AcquisitionRow>[] = [
    { key: "full_name", label: "Compte", render: (r) => <Link href={`/admin/utilisateurs/${r.user_id}`}>{r.full_name}</Link> },
    { key: "role", label: "Rôle", render: (r) => (r.role === "tailor" ? "Tailleur" : "Client") },
    { key: "created_at", label: "Inscription", sort: "created_at", render: (r) => formatDate(r.created_at) },
    { key: "platform", label: "Support", render: (r) => (r.platform === "web" ? "Site" : "Application") },
    { key: "self_reported", label: "Déclaré", render: (r) => r.self_reported ?? "—" },
    { key: "utm", label: "Campagne web", optional: true, render: (r) => r.utm ?? "—" },
    { key: "referral_code", label: "Code", optional: true, render: (r) => r.referral_code ?? "—" },
    { key: "channel", label: "Canal", render: (r) => r.channel ?? "—" },
    {
      key: "qualify",
      label: "Qualifier",
      render: (r) => (r.qualified ? <span className="adMuted">Qualifié</span> : <Button variant="secondary" className="adBtnSm" onClick={() => setQualifyId(r.user_id)}>Qualifier</Button>),
    },
  ];

  const bulk = async (ids: string[], done: () => void) => {
    setBulkIds(ids);
    setBulkDone(() => done);
  };
  const [bulkIds, setBulkIds] = useState<string[]>([]);
  const [bulkDone, setBulkDone] = useState<(() => void) | null>(null);

  return (
    <>
      <div className="adToolbar">
        <div className="adTabs" role="tablist">
          {[{ key: "todo", label: "À qualifier" }, { key: "done", label: "Qualifiés" }, { key: "all", label: "Tous" }].map((t) => (
            <button key={t.key} role="tab" aria-selected={s.state === t.key} className={`adTab ${s.state === t.key ? "adTabActive" : ""}`} onClick={() => set({ state: t.key })}>
              {t.label}
            </button>
          ))}
        </div>
        <FilterText label="Recherche" value={s.q} onChange={(q) => set({ q })} placeholder="Nom, téléphone" wide />
        <FilterSelect label="Rôle" value={s.role} onChange={(role) => set({ role })} options={{ client: "Clients", tailor: "Tailleurs" }} />
        <FilterDate label="Depuis" value={s.date_from} onChange={(date_from) => set({ date_from })} />
        <FilterDate label="Jusqu'au" value={s.date_to} onChange={(date_to) => set({ date_to })} />
      </div>
      <DataTable<AcquisitionRow>
        id="acquisitions"
        columns={columns}
        fetcher={(p) => Growth.acquisitions({ ...filtersOf(s), ...p })}
        filters={filtersOf(s)}
        query={tableQuery(s)}
        onQuery={set}
        rowKey={(r) => r.user_id}
        exportPath="/admin/growth/acquisitions"
        exportName="acquisitions"
        selectable
        bulk={(ids, done) => (
          <Button variant="secondary" className="adBtnSm" onClick={() => bulk(ids, done)}>Qualifier en lot ({ids.length})</Button>
        )}
        reloadToken={reload}
      />
      {qualifyId && (
        <Panel title="Qualifier" actions={<Button variant="secondary" className="adBtnSm" onClick={() => setQualifyId(null)}>Fermer</Button>}>
          <QualifyForm userId={qualifyId} onDone={() => { setQualifyId(null); setReload((n) => n + 1); }} />
        </Panel>
      )}
      {bulkIds.length > 0 && (
        <Panel title={`Qualifier en lot (${bulkIds.length})`} actions={<Button variant="secondary" className="adBtnSm" onClick={() => { setBulkIds([]); setBulkDone(null); }}>Fermer</Button>}>
          <QualifyForm
            userId={bulkIds[0]}
            onDone={() => {
              const [, ...rest] = bulkIds;
              if (rest.length === 0) {
                setBulkIds([]);
                toast("Lot qualifié.");
                setReload((n) => n + 1);
                bulkDone?.();
                setBulkDone(null);
              } else {
                setBulkIds(rest);
              }
            }}
          />
          <p className="adHint">Le même formulaire s&apos;applique à chaque compte du lot, un par un.</p>
        </Panel>
      )}
    </>
  );
}

function ChannelsTab() {
  const { toast } = useFeedback();
  const list = useLoad(() => Growth.channels(), []);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<Channel | null>(null);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const body = { code: code.trim().toLowerCase(), name: name.trim(), self_reportable: true, active: true, sort_order: editing?.sort_order ?? 0 };
      if (editing) await Growth.updateChannel(editing.id, body);
      else await Growth.createChannel(body);
      toast("Canal enregistré.");
      setCode("");
      setName("");
      setEditing(null);
      list.reload();
    } catch (err) {
      toast((err as Error).message, { error: true });
    }
  };

  return (
    <Panel title="Canaux">
      {list.error ? <ErrorState error={list.error} onRetry={list.reload} /> : !list.data ? <Loading /> : (
        <ul className="adList">
          {list.data.map((c) => (
            <li key={c.id}>
              <strong>{c.name}</strong> <span className="adHint">({c.code} · {formatNumber(c.users)} compte(s){c.active ? "" : " · inactif"})</span>{" "}
              <button className="adLinkBtn" onClick={() => { setEditing(c); setCode(c.code); setName(c.name); }}>modifier</button>
            </li>
          ))}
        </ul>
      )}
      <form className="adRow" onSubmit={(e) => void save(e)}>
        <label className="adFilter"><span>Code</span><input className="input" value={code} onChange={(e) => setCode(e.target.value)} required pattern="[a-z0-9_]+" placeholder="salon_douala" /></label>
        <label className="adFilter"><span>Nom</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} required /></label>
        <Button variant="primary" className="adBtnSm" type="submit">{editing ? "Modifier" : "Créer"}</Button>
        {editing && <Button variant="secondary" className="adBtnSm" type="button" onClick={() => { setEditing(null); setCode(""); setName(""); }}>Annuler</Button>}
      </form>
      <p className="adHint">Un canal se désactive en le vidant de ses comptes ; la suppression définitive se fait quand il n&apos;est plus utilisé.</p>
    </Panel>
  );
}

function CampaignsTab() {
  const { confirm, toast } = useFeedback();
  const list = useLoad(() => Growth.campaigns(), []);
  const channels = useLoad(() => Growth.channels(), []);
  const [form, setForm] = useState<{ id: string | null; name: string; code: string; channel_id: string; budget: string; notes: string }>({
    id: null, name: "", code: "", channel_id: "", budget: "", notes: "",
  });

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const budget = form.budget.trim() === "" ? null : Number(form.budget);
    if (budget !== null && (!Number.isFinite(budget) || budget < 0)) {
      toast("Budget invalide.", { error: true });
      return;
    }
    const body = { name: form.name.trim(), code: form.code.trim().toUpperCase(), channel_id: form.channel_id || null, starts_on: null, ends_on: null, budget, notes: form.notes.trim() || null, active: true };
    try {
      if (form.id) await Growth.updateCampaign(form.id, body);
      else await Growth.createCampaign(body);
      toast("Campagne enregistrée.");
      setForm({ id: null, name: "", code: "", channel_id: "", budget: "", notes: "" });
      list.reload();
    } catch (err) {
      toast((err as Error).message, { error: true });
    }
  };

  return (
    <Panel title="Campagnes (budget et coût d'acquisition)">
      {list.error ? <ErrorState error={list.error} onRetry={list.reload} /> : !list.data ? <Loading /> : (
        <ul className="adList">
          {list.data.map((c: Campaign) => (
            <li key={c.id}>
              <strong>{c.name}</strong> <span className="adHint">({c.code}{c.channel ? ` · ${c.channel}` : ""} · {formatNumber(c.users)} inscription(s){c.budget != null ? ` · budget ${formatFcfa(c.budget)}` : ""})</span>{" "}
              <button className="adLinkBtn" onClick={() => setForm({ id: c.id, name: c.name, code: c.code, channel_id: c.channel_id ?? "", budget: c.budget != null ? String(c.budget) : "", notes: c.notes ?? "" })}>modifier</button>{" "}
              <button
                className="adLinkBtn adDanger"
                onClick={async () => {
                  if ((await confirm({ title: `Supprimer « ${c.name} » ?`, danger: true, confirmLabel: "Supprimer" })) === null) return;
                  try {
                    await Growth.deleteCampaign(c.id);
                    toast("Campagne supprimée.");
                    list.reload();
                  } catch (err) {
                    toast((err as Error).message, { error: true });
                  }
                }}
              >
                supprimer
              </button>
            </li>
          ))}
        </ul>
      )}
      <form className="adForm" onSubmit={(e) => void save(e)}>
        <h4>{form.id ? "Modifier la campagne" : "Nouvelle campagne"}</h4>
        <div className="adRow">
          <label className="adFilter"><span>Nom</span><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
          <label className="adFilter"><span>Code</span><input className="input" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required placeholder="SALON26" /></label>
          <label className="adFilter">
            <span>Canal</span>
            <select className="input" value={form.channel_id} onChange={(e) => setForm({ ...form, channel_id: e.target.value })}>
              <option value="">—</option>
              {(channels.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="adFilter"><span>Budget (FCFA)</span><input className="input" inputMode="numeric" value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} /></label>
        </div>
        <label className="adFilter"><span>Notes</span><textarea className="input adTextarea" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
        <span className="adRow">
          <Button variant="primary" className="adBtnSm" type="submit">{form.id ? "Modifier" : "Créer"}</Button>
          {form.id && <Button variant="secondary" className="adBtnSm" type="button" onClick={() => setForm({ id: null, name: "", code: "", channel_id: "", budget: "", notes: "" })}>Annuler</Button>}
        </span>
      </form>
    </Panel>
  );
}

function GoalsTab() {
  const { confirm, toast } = useFeedback();
  const goals = useLoad(() => Growth.goals(), []);
  const [form, setForm] = useState({ id: null as string | null, label: "", metric: "new_clients", target: "", comparator: ">=" });

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const target = Number(form.target);
    if (!form.label.trim() || !Number.isFinite(target) || target <= 0) {
      toast("Libellé et cible requis.", { error: true });
      return;
    }
    try {
      if (form.id) await Growth.updateGoal(form.id, { label: form.label.trim(), metric: form.metric, period: "month", target, comparator: form.comparator, active: true });
      else await Growth.createGoal({ label: form.label.trim(), metric: form.metric, period: "month", target, comparator: form.comparator, active: true });
      toast("Objectif enregistré.");
      setForm({ id: null, label: "", metric: "new_clients", target: "", comparator: ">=" });
      goals.reload();
    } catch (err) {
      toast((err as Error).message, { error: true });
    }
  };

  return (
    <Panel title="Objectifs">
      {goals.error ? <ErrorState error={goals.error} onRetry={goals.reload} /> : !goals.data ? <Loading /> : (
        <ul className="adList">
          {goals.data.goals.map((g: Goal) => (
            <li key={g.id}>
              <strong>{g.label}</strong> <span className="adHint">({g.metric_label} {g.comparator} {formatNumber(g.target)})</span>
              {g.progress_pct != null && <Progress pct={g.progress_pct} />}
              {g.value != null && <span className="adHint"> · {formatNumber(g.value)}{g.reached ? " · atteint" : ""}</span>}{" "}
              <button
                className="adLinkBtn adDanger"
                onClick={async () => {
                  if ((await confirm({ title: `Supprimer « ${g.label} » ?`, danger: true, confirmLabel: "Supprimer" })) === null) return;
                  try {
                    await Growth.deleteGoal(g.id);
                    toast("Objectif supprimé.");
                    goals.reload();
                  } catch (err) {
                    toast((err as Error).message, { error: true });
                  }
                }}
              >
                supprimer
              </button>
            </li>
          ))}
        </ul>
      )}
      <form className="adRow" onSubmit={(e) => void save(e)}>
        <label className="adFilter"><span>Libellé</span><input className="input" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} required placeholder="500 clients" /></label>
        <label className="adFilter">
          <span>Métrique</span>
          <select className="input" value={form.metric} onChange={(e) => setForm({ ...form, metric: e.target.value })}>
            {Object.entries(goals.data?.metrics ?? { new_clients: "Nouveaux clients" }).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label className="adFilter"><span>Cible</span><input className="input" inputMode="numeric" value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })} required /></label>
        <Button variant="primary" className="adBtnSm" type="submit">{form.id ? "Modifier" : "Créer"}</Button>
      </form>
    </Panel>
  );
}

function LinksTab() {
  const campaigns = useLoad(() => Growth.campaigns(), []);
  const [campaign, setCampaign] = useState("");
  const [source, setSource] = useState("affiche");
  const [path, setPath] = useState("/");
  const base = "https://sur-me-zur.vercel.app";
  const code = (campaigns.data ?? []).find((c) => c.id === campaign)?.code ?? "";
  const url = `${base}${path.startsWith("/") ? path : `/${path}`}?utm_source=${encodeURIComponent(source)}${code ? `&utm_campaign=${encodeURIComponent(code)}` : ""}`;
  return (
    <Panel title="Générateur de liens de campagne">
      <p className="adHint">Collez ce lien sur vos affiches, statuts et publications : l&apos;origine sera lue à l&apos;inscription.</p>
      <div className="adRow">
        <label className="adFilter">
          <span>Campagne</span>
          <select className="input" value={campaign} onChange={(e) => setCampaign(e.target.value)}>
            <option value="">—</option>
            {(campaigns.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name} ({c.code})</option>)}
          </select>
        </label>
        <label className="adFilter"><span>Source</span><input className="input" value={source} onChange={(e) => setSource(e.target.value)} placeholder="affiche, statut_whatsapp…" /></label>
        <label className="adFilter"><span>Page d&apos;arrivée</span><input className="input" value={path} onChange={(e) => setPath(e.target.value)} /></label>
      </div>
      <p className="adCode">{url}</p>
      <Button variant="secondary" className="adBtnSm" onClick={() => void navigator.clipboard?.writeText(url)}>Copier le lien</Button>
    </Panel>
  );
}
