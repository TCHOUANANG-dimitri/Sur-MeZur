"use client";

// Reglages (13.7, 13.8) : formulaires lisibles, pas du JSON brut. Seuls les
// reglages des fonctions actives sont proposes (le serveur ne renvoie que
// ceux-la) ; s'y ajoutent les pages d'information du site (conditions,
// confidentialite, FAQ).

import { useState } from "react";
import { Security, Support, type InfoPage } from "@/lib/api/admin";
import { Button } from "@/components/ui";
import { useFeedback } from "@/components/admin/Feedback";
import { ErrorState, Loading, PageHead, Panel, renderMarkdown, useLoad } from "@/components/admin/kit";
import { formatDateTime } from "@/components/admin/format";

type Values = Record<string, unknown>;

export default function SettingsPage() {
  const { toast } = useFeedback();
  const loaded = useLoad(() => Security.settings(), []);
  const [draft, setDraft] = useState<Values | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  const values = (draft ?? loaded.data?.values ?? {}) as Values;
  const labels = (loaded.data?.labels ?? {}) as Record<string, string>;

  const save = async (key: string, value: unknown) => {
    setSaving(key);
    try {
      await Security.saveSetting(key, value);
      toast("Réglage enregistré.");
      setDraft((d) => ({ ...(d ?? {}), [key]: value }));
      loaded.reload();
    } catch (e) {
      toast((e as Error).message, { error: true });
    } finally {
      setSaving(null);
    }
  };

  if (loaded.error) return <div className="adPage"><PageHead title="Réglages" /><ErrorState error={loaded.error} onRetry={loaded.reload} /></div>;
  if (!loaded.data) return <div className="adPage"><Loading /></div>;

  return (
    <div className="adPage">
      <PageHead title="Réglages" sub="Les valeurs prennent effet en quelques secondes." />
      <div className="adGrid2">
        <Panel title={labels.features ?? "Génération de patrons"}>
          <PatternsRow value={(values.features ?? {}) as Record<string, unknown>} onSave={(v) => void save("features", v)} saving={saving === "features"} />
        </Panel>
        <Panel title="Maintenance">
          <MaintenanceRow value={(values.maintenance ?? {}) as Record<string, unknown>} onSave={(v) => void save("maintenance", v)} saving={saving === "maintenance"} />
        </Panel>
      </div>
      <div className="adGrid2">
        <Panel title="Comptes et sessions">
          <NumRow label={labels.guest_retention_days} value={values.guest_retention_days} onSave={(v) => void save("guest_retention_days", v)} saving={saving === "guest_retention_days"} />
          <NumRow label={labels.churn_inactivity_days} value={values.churn_inactivity_days} onSave={(v) => void save("churn_inactivity_days", v)} saving={saving === "churn_inactivity_days"} />
          <NumRow label={labels.admin_idle_minutes} value={values.admin_idle_minutes} onSave={(v) => void save("admin_idle_minutes", v)} saving={saving === "admin_idle_minutes"} />
          <BoolRow label={labels.signup_source_question} value={values.signup_source_question} onSave={(v) => void save("signup_source_question", v)} saving={saving === "signup_source_question"} />
        </Panel>
        <Panel title="Alertes et collecte">
          <NumRow label={labels.order_no_response_days} value={values.order_no_response_days} onSave={(v) => void save("order_no_response_days", v)} saving={saving === "order_no_response_days"} />
          <QualityRow value={(values.tailor_quality ?? {}) as Record<string, unknown>} onSave={(v) => void save("tailor_quality", v)} saving={saving === "tailor_quality"} />
          <TargetRow value={(values.collecte_target ?? {}) as Record<string, unknown>} onSave={(v) => void save("collecte_target", v)} saving={saving === "collecte_target"} />
        </Panel>
      </div>
      <Panel title={labels.cities ?? "Villes et quartiers"}>
        <CitiesEditor value={Array.isArray(values.cities) ? (values.cities as { name: string; quartiers: string[] }[]) : []} onSave={(v) => void save("cities", v)} saving={saving === "cities"} />
      </Panel>
      <InfoPages />
    </div>
  );
}

function NumRow({ label, value, onSave, saving }: { label?: string; value: unknown; onSave: (v: number) => void; saving: boolean }) {
  const [v, setV] = useState<string | null>(null);
  return (
    <form className="adRow" onSubmit={(e) => { e.preventDefault(); onSave(Number(v ?? value)); setV(null); }}>
      <label className="adFilter"><span>{label}</span><input className="input" inputMode="numeric" value={v ?? String(value ?? "")} onChange={(e) => setV(e.target.value)} /></label>
      <Button variant="secondary" className="adBtnSm" type="submit" disabled={saving}>Enregistrer</Button>
    </form>
  );
}

function BoolRow({ label, value, onSave, saving }: { label?: string; value: unknown; onSave: (v: boolean) => void; saving: boolean }) {
  return (
    <label className="adFilter">
      <span><input type="checkbox" checked={Boolean(value)} disabled={saving} onChange={(e) => onSave(e.target.checked)} /> {label}</span>
    </label>
  );
}

function MaintenanceRow({ value, onSave, saving }: { value: Record<string, unknown>; onSave: (v: Record<string, unknown>) => void; saving: boolean }) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  return (
    <form
      className="adForm"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ enabled: enabled ?? Boolean(value.enabled), message: (message ?? String(value.message ?? "")).trim() });
      }}
    >
      <label className="adFilter">
        <span><input type="checkbox" checked={enabled ?? Boolean(value.enabled)} onChange={(e) => setEnabled(e.target.checked)} /> Site en maintenance</span>
      </label>
      <label className="adFilter"><span>Message affiché</span><input className="input" value={message ?? String(value.message ?? "")} onChange={(e) => setMessage(e.target.value)} /></label>
      <Button variant="primary" className="adBtnSm" type="submit" disabled={saving}>Enregistrer</Button>
    </form>
  );
}

/** Seul interrupteur qui reste : le moteur de patrons. Les autres cles de
 *  `features` (verification, paiements, negociation) restent coupees. */
function PatternsRow({ value, onSave, saving }: { value: Record<string, unknown>; onSave: (v: Record<string, unknown>) => void; saving: boolean }) {
  const [mode, setMode] = useState<string | null>(null);
  return (
    <form
      className="adForm"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ ...value, pattern_generation: mode ?? value.pattern_generation ?? "preview" });
      }}
    >
      <label className="adFilter">
        <span>Moteur</span>
        <select className="input" value={String(mode ?? value.pattern_generation ?? "preview")} onChange={(e) => setMode(e.target.value)}>
          <option value="off">Coupée</option>
          <option value="preview">Aperçu (moteur de démonstration)</option>
          <option value="on">Activée (GarmentCode : patrons cotés, PDF)</option>
        </select>
      </label>
      <Button variant="primary" className="adBtnSm" type="submit" disabled={saving}>Enregistrer</Button>
    </form>
  );
}

function QualityRow({ value, onSave, saving }: { value: Record<string, unknown>; onSave: (v: Record<string, unknown>) => void; saving: boolean }) {
  const [v, setV] = useState({ ...value });
  const num = (k: string) => Number(v[k] ?? value[k] ?? 0);
  return (
    <form
      className="adForm"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ ...value, max_response_hours: num("max_response_hours"), max_late_rate: num("max_late_rate") });
      }}
    >
      <div className="adRow">
        <label className="adFilter"><span>Réponse max (h)</span><input className="input" inputMode="numeric" value={String(v.max_response_hours ?? value.max_response_hours ?? "")} onChange={(e) => setV({ ...v, max_response_hours: e.target.value })} /></label>
        <label className="adFilter"><span>Taux de retard max</span><input className="input" inputMode="decimal" value={String(v.max_late_rate ?? value.max_late_rate ?? "")} onChange={(e) => setV({ ...v, max_late_rate: e.target.value })} /></label>
      </div>
      <Button variant="secondary" className="adBtnSm" type="submit" disabled={saving}>Enregistrer</Button>
    </form>
  );
}

function TargetRow({ value, onSave, saving }: { value: Record<string, unknown>; onSave: (v: Record<string, unknown>) => void; saving: boolean }) {
  const [total, setTotal] = useState<string | null>(null);
  const [minimum, setMinimum] = useState<string | null>(null);
  return (
    <form
      className="adForm"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ ...(value as object), total: Number(total ?? value.total), minimum: Number(minimum ?? value.minimum) });
      }}
    >
      <div className="adRow">
        <label className="adFilter"><span>Objectif total</span><input className="input" inputMode="numeric" value={total ?? String(value.total ?? "")} onChange={(e) => setTotal(e.target.value)} /></label>
        <label className="adFilter"><span>Minimum</span><input className="input" inputMode="numeric" value={minimum ?? String(value.minimum ?? "")} onChange={(e) => setMinimum(e.target.value)} /></label>
      </div>
      <Button variant="secondary" className="adBtnSm" type="submit" disabled={saving}>Enregistrer</Button>
    </form>
  );
}

function CitiesEditor({ value, onSave, saving }: { value: { name: string; quartiers: string[] }[]; onSave: (v: { name: string; quartiers: string[] }[]) => void; saving: boolean }) {
  const [cities, setCities] = useState(value);
  const [synced, setSynced] = useState(false);
  if (!synced && value.length > 0) {
    setCities(value);
    setSynced(true);
  }
  const [newCity, setNewCity] = useState("");
  const [newQ, setNewQ] = useState<Record<string, string>>({});
  return (
    <div>
      {cities.map((c, i) => (
        <div key={c.name} className="adCityRow">
          <strong>{c.name}</strong>{" "}
          {c.quartiers.map((q) => (
            <span key={q} className="adChip">
              {q}{" "}
              <button className="adLinkBtn adNoPrint" aria-label={`Retirer ${q}`} onClick={() => setCities(cities.map((x, j) => (j === i ? { ...x, quartiers: x.quartiers.filter((y) => y !== q) } : x)))}>
                ×
              </button>
            </span>
          ))}{" "}
          <input
            className="input adInline adNoPrint"
            placeholder="+ quartier"
            value={newQ[c.name] ?? ""}
            onChange={(e) => setNewQ({ ...newQ, [c.name]: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                const q = (newQ[c.name] ?? "").trim();
                if (q) setCities(cities.map((x, j) => (j === i ? { ...x, quartiers: [...x.quartiers, q] } : x)));
                setNewQ({ ...newQ, [c.name]: "" });
              }
            }}
          />
        </div>
      ))}
      <form
        className="adRow adNoPrint"
        onSubmit={(e) => {
          e.preventDefault();
          if (newCity.trim()) setCities([...cities, { name: newCity.trim(), quartiers: [] }]);
          setNewCity("");
        }}
      >
        <label className="adFilter"><span>Nouvelle ville</span><input className="input" value={newCity} onChange={(e) => setNewCity(e.target.value)} /></label>
        <Button variant="secondary" className="adBtnSm" type="submit">Ajouter</Button>
        <Button variant="primary" className="adBtnSm" type="button" disabled={saving} onClick={() => onSave(cities)}>Enregistrer les villes</Button>
      </form>
    </div>
  );
}

/** Pages d'information du site (/infos/<adresse>) : conditions, confidentialite, FAQ. */
function InfoPages() {
  const { toast } = useFeedback();
  const list = useLoad(() => Support.pages(), []);
  const [slug, setSlug] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [published, setPublished] = useState(true);

  const open = (p: InfoPage) => {
    setSlug(p.slug);
    setTitle(p.title);
    setBody(p.body);
    setPublished(p.published);
  };

  return (
    <>
      <Panel title="Pages d'information du site">
        {list.error ? <ErrorState error={list.error} onRetry={list.reload} /> : !list.data ? <Loading /> : (
          <ul className="adList">
            {list.data.map((p) => (
              <li key={p.slug}>
                <button className="adLinkBtn" onClick={() => open(p)}><strong>{p.title}</strong></button>{" "}
                <span className="adHint">/infos/{p.slug} · {p.published ? "publiée" : "brouillon"} · {formatDateTime(p.updated_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      {slug && (
        <Panel title={`Modifier — ${slug}`}>
          <form
            className="adForm"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await Support.savePage(slug, { title: title.trim(), body, published });
                toast("Page enregistrée.");
                list.reload();
              } catch (err) {
                toast((err as Error).message, { error: true });
              }
            }}
          >
            <label className="adFilter"><span>Titre</span><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} required /></label>
            <label className="adFilter"><span><input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} /> Publiée</span></label>
            <div className="adGrid2">
              <label className="adFilter"><span>Contenu (titres ##, listes -, **gras**, liens)</span><textarea className="input adTextarea" rows={12} value={body} onChange={(e) => setBody(e.target.value)} /></label>
              <div><h4>Aperçu</h4><div className="adProse" dangerouslySetInnerHTML={{ __html: renderMarkdown(body) }} /></div>
            </div>
            <span className="adRow">
              <Button variant="primary" className="adBtnSm" type="submit">Enregistrer</Button>
              <Button variant="secondary" className="adBtnSm" type="button" onClick={() => setSlug(null)}>Fermer</Button>
            </span>
          </form>
        </Panel>
      )}
    </>
  );
}
