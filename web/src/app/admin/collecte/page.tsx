"use client";

// Campagne de collecte (M10) : fiches a relire (photos via AuthImage),
// objectifs par sous-groupe, agents, export.

import { useState } from "react";
import { Collecte, Measure, type CollecteSubject } from "@/lib/api/admin";
import { Button } from "@/components/ui";
import { useFeedback } from "@/components/admin/Feedback";
import { AuthImage, ErrorState, Loading, PageHead, Panel, useLoad } from "@/components/admin/kit";
import { formatDate, formatDateTime, formatNumber, formatPct, measureLabel } from "@/components/admin/format";

const TABS = ["fiches", "objectifs", "agents"] as const;

export default function CollectePage() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("fiches");
  return (
    <div className="adPage">
      <PageHead title="Campagne de collecte" sub="Relecture des fiches terrain, objectifs, agents." />
      <div className="adTabs" role="tablist">
        {[{ key: "fiches", label: "Fiches à relire" }, { key: "objectifs", label: "Objectifs" }, { key: "agents", label: "Agents" }].map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} className={`adTab ${tab === t.key ? "adTabActive" : ""}`} onClick={() => setTab(t.key as (typeof TABS)[number])}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === "fiches" && <SubjectsTab />}
      {tab === "objectifs" && <ObjectivesTab />}
      {tab === "agents" && <AgentsTab />}
    </div>
  );
}

function SubjectsTab() {
  const { confirm, toast } = useFeedback();
  const [status, setStatus] = useState("pending");
  const [openId, setOpenId] = useState<string | null>(null);
  const list = useLoad(() => Collecte.subjects({ review_status: status === "all" ? undefined : status }), [status]);

  const review = async (id: string, st: "validated" | "rejected" | "pending") => {
    const note = st === "rejected"
      ? await confirm({ title: "Rejeter cette fiche ?", danger: true, confirmLabel: "Rejeter", reason: { label: "Motif (tracé)", required: true } })
      : "";
    if (note === null) return;
    try {
      await Collecte.review(id, st, (note || undefined) as string | undefined);
      toast("Fiche relue.");
      list.reload();
    } catch (e) {
      toast((e as Error).message, { error: true });
    }
  };

  return (
    <>
      <div className="adToolbar">
        <div className="adTabs" role="tablist">
          {[{ key: "pending", label: "À relire" }, { key: "validated", label: "Validées" }, { key: "rejected", label: "Rejetées" }, { key: "all", label: "Toutes" }].map((t) => (
            <button key={t.key} role="tab" aria-selected={status === t.key} className={`adTab ${status === t.key ? "adTabActive" : ""}`} onClick={() => setStatus(t.key)}>
              {t.label}
            </button>
          ))}
        </div>
        <Button variant="secondary" className="adBtnSm" onClick={() => Collecte.exportArchive("zip")}>Exporter (ZIP)</Button>
      </div>
      {list.error ? <ErrorState error={list.error} onRetry={list.reload} /> : !list.data ? <Loading /> : list.data.length === 0 ? (
        <Panel title="Fiches"><p className="adHint">Rien à relire.</p></Panel>
      ) : (
        list.data.map((s) => <SubjectCard key={s.id} s={s} open={openId === s.id} onOpen={() => setOpenId(openId === s.id ? null : s.id)} onReview={review} />)
      )}
    </>
  );
}

function SubjectCard({ s, open, onOpen, onReview }: {
  s: CollecteSubject;
  open: boolean;
  onOpen: () => void;
  onReview: (id: string, st: "validated" | "rejected" | "pending") => void;
}) {
  return (
    <Panel
      title={`${s.code} — ${s.gender === "female" ? "Femme" : "Homme"}${s.age != null ? `, ${s.age} ans` : ""} · ${s.height_cm} cm · ${s.weight_kg} kg`}
      actions={<Button variant="secondary" className="adBtnSm" onClick={onOpen}>{open ? "Replier" : "Relire"}</Button>}
    >
      <p className="adHint">
        {s.collector_name ?? "Agent inconnu"} · {s.city ?? "—"}{s.place ? ` · ${s.place}` : ""} · {formatDate(s.created_at)}
        {s.complete ? "" : " · incomplet"} · statut : {s.review_status}
        {s.review_note ? ` — ${s.review_note}` : ""}
      </p>
      {open && (
        <>
          <div className="adDocGrid">
            {s.photos.map((p) => (
              <figure key={p.view} className="adDoc">
                <AuthImage src={Collecte.photoUrl(s.id, p.view)} alt={`${s.code} ${p.view}`} />
                <figcaption>{p.view} · {p.width && p.height ? `${p.width}×${p.height}` : "dimensions inconnues"}</figcaption>
              </figure>
            ))}
          </div>
          <dl className="adMeasureGrid">
            {Object.entries(s.measurements).map(([k, v]) => (
              <div className="adKv" key={k}><dt>{measureLabel(k)}</dt><dd>{v} cm</dd></div>
            ))}
          </dl>
          {s.notes && <p className="adHint">Notes terrain : {s.notes}</p>}
          <div className="adRow">
            <Button variant="primary" className="adBtnSm" onClick={() => onReview(s.id, "validated")}>Valider</Button>
            <Button variant="danger" className="adBtnSm" onClick={() => onReview(s.id, "rejected")}>Rejeter</Button>
          </div>
        </>
      )}
    </Panel>
  );
}

function ObjectivesTab() {
  const obj = useLoad(() => Measure.collecteObjectives(), []);
  const stats = useLoad(() => Collecte.stats(), []);
  return (
    <>
      {obj.error ? <ErrorState error={obj.error} onRetry={obj.reload} /> : !obj.data ? <Loading /> : (
        <Panel title={`Objectif : ${formatNumber(obj.data.collected)} / ${formatNumber(obj.data.target)} fiches`}>
          <div className="adKpis">
            <div className="adKpi"><div className="adKpiLabel">Collectées</div><div className="adKpiValue">{formatNumber(obj.data.collected)}</div></div>
            <div className="adKpi"><div className="adKpiLabel">Validées</div><div className="adKpiValue">{formatNumber(obj.data.validated)}</div></div>
            <div className="adKpi"><div className="adKpiLabel">Progression</div><div className="adKpiValue">{obj.data.progress_pct == null ? "—" : formatPct(obj.data.progress_pct / 100)}</div></div>
          </div>
          <div className="adGrid2">
            <div>
              <h4>Par sexe (cible {obj.data.gender_targets.female}/{obj.data.gender_targets.male})</h4>
              <ul className="adList">{obj.data.by_gender.map((g) => <li key={g.name}>{g.name} : <strong>{g.count}</strong></li>)}</ul>
              <h4>Par ville</h4>
              <ul className="adList">{obj.data.by_city.map((g) => <li key={g.name}>{g.name} : <strong>{g.count}</strong></li>)}</ul>
            </div>
            <div>
              <h4>Par corpulence</h4>
              <ul className="adList">{obj.data.by_corpulence.map((g) => <li key={g.name}>{g.name} : <strong>{g.count}</strong></li>)}</ul>
              <h4>Par semaine</h4>
              <ul className="adList">{obj.data.by_week.map((g) => <li key={g.week}>{g.week} : <strong>{g.count}</strong></li>)}</ul>
            </div>
          </div>
        </Panel>
      )}
      {stats.error ? <ErrorState error={stats.error} onRetry={stats.reload} /> : stats.data ? (
        <Panel title="Compteurs">
          <ul className="adList">{Object.entries(stats.data).map(([k, v]) => <li key={k}>{k} : <strong>{formatNumber(v)}</strong></li>)}</ul>
        </Panel>
      ) : <Loading />}
    </>
  );
}

function AgentsTab() {
  const { confirm, toast } = useFeedback();
  const agents = useLoad(() => Collecte.collectors(), []);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");

  return (
    <Panel title="Agents de terrain">
      {agents.error ? <ErrorState error={agents.error} onRetry={agents.reload} /> : !agents.data ? <Loading /> : (
        <ul className="adList">
          {agents.data.map((a) => (
            <li key={a.id}>
              <strong>{a.full_name}</strong> · {a.phone}
              {a.subjects != null && <span className="adHint"> · {a.subjects} fiche(s)</span>}
              {!a.is_active && <span className="adWarn"> · désactivé</span>}{" "}
              <button
                className="adLinkBtn"
                onClick={async () => {
                  if ((await confirm({ title: a.is_active ? `Désactiver ${a.full_name} ?` : `Réactiver ${a.full_name} ?`, danger: a.is_active, confirmLabel: "Appliquer" })) === null) return;
                  try {
                    await Collecte.setCollectorActive(a.id, !a.is_active);
                    toast("Agent mis à jour.");
                    agents.reload();
                  } catch (e) {
                    toast((e as Error).message, { error: true });
                  }
                }}
              >
                {a.is_active ? "désactiver" : "réactiver"}
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="adForm"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await Collecte.createCollector({ full_name: name.trim(), phone: phone.trim(), password });
            toast("Agent créé : communiquez-lui son mot de passe.");
            setName("");
            setPhone("");
            setPassword("");
            agents.reload();
          } catch (err) {
            toast((err as Error).message, { error: true });
          }
        }}
      >
        <h4>Nouvel agent</h4>
        <label className="adFilter"><span>Nom complet</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} /></label>
        <label className="adFilter"><span>Téléphone</span><input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} required /></label>
        <label className="adFilter"><span>Mot de passe initial</span><input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} /></label>
        <Button variant="primary" className="adBtnSm" type="submit">Créer l&apos;agent</Button>
      </form>
      <p className="adHint">Export des données : <button className="adLinkBtn" onClick={() => Collecte.exportArchive("zip")}>ZIP</button> · <button className="adLinkBtn" onClick={() => Collecte.exportArchive("csv")}>CSV</button></p>
      <p className="adHint">Relecture du {formatDateTime(new Date().toISOString())} — les photos ne sortent que par des routes vérifiées.</p>
    </Panel>
  );
}
