"use client";

// Reglages (13.7, 13.8) : formulaires lisibles, pas du JSON brut — dont les
// nouvelles bascules `features` (verification, paiements, negociation,
// patrons).

import { useState } from "react";
import { Security } from "@/lib/api/admin";
import { Button } from "@/components/ui";
import { useFeedback } from "@/components/admin/Feedback";
import { ErrorState, Loading, PageHead, Panel, useLoad } from "@/components/admin/kit";

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
      <PageHead title="Réglages" sub="Chaque changement est tracé au journal. Les valeurs prennent effet en quelques secondes." />
      <Panel title={labels.features ?? "Fonctionnalités"}>
        <FeatureToggles value={(values.features ?? {}) as Record<string, unknown>} onSave={(v) => void save("features", v)} saving={saving === "features"} />
      </Panel>
      <div className="adGrid2">
        <Panel title="Comptes et sessions">
          <NumRow label={labels.guest_retention_days} value={values.guest_retention_days} onSave={(v) => void save("guest_retention_days", v)} saving={saving === "guest_retention_days"} />
          <NumRow label={labels.churn_inactivity_days} value={values.churn_inactivity_days} onSave={(v) => void save("churn_inactivity_days", v)} saving={saving === "churn_inactivity_days"} />
          <NumRow label={labels.admin_idle_minutes} value={values.admin_idle_minutes} onSave={(v) => void save("admin_idle_minutes", v)} saving={saving === "admin_idle_minutes"} />
          <BoolRow label={labels.signup_source_question} value={values.signup_source_question} onSave={(v) => void save("signup_source_question", v)} saving={saving === "signup_source_question"} />
        </Panel>
        <Panel title="Maintenance">
          <MaintenanceRow value={(values.maintenance ?? {}) as Record<string, unknown>} onSave={(v) => void save("maintenance", v)} saving={saving === "maintenance"} />
        </Panel>
      </div>
      <div className="adGrid2">
        <Panel title="Commandes et litiges">
          <NumRow label={labels.negotiation_max_rounds} value={values.negotiation_max_rounds} onSave={(v) => void save("negotiation_max_rounds", v)} saving={saving === "negotiation_max_rounds"} />
          <NumRow label={labels.offer_expiry_days} value={values.offer_expiry_days} onSave={(v) => void save("offer_expiry_days", v)} saving={saving === "offer_expiry_days"} />
          <NumRow label={labels.order_no_response_days} value={values.order_no_response_days} onSave={(v) => void save("order_no_response_days", v)} saving={saving === "order_no_response_days"} />
          <NumRow label={labels.dispute_alert_days} value={values.dispute_alert_days} onSave={(v) => void save("dispute_alert_days", v)} saving={saving === "dispute_alert_days"} />
          <ShareRow label={labels.deposit_share} value={values.deposit_share} onSave={(v) => void save("deposit_share", v)} saving={saving === "deposit_share"} />
          <ShareRow label={labels.tailor_immediate_share} value={values.tailor_immediate_share} onSave={(v) => void save("tailor_immediate_share", v)} saving={saving === "tailor_immediate_share"} />
        </Panel>
        <Panel title="Qualité tailleurs et collecte">
          <QualityRow value={(values.tailor_quality ?? {}) as Record<string, unknown>} onSave={(v) => void save("tailor_quality", v)} saving={saving === "tailor_quality"} />
          <TargetRow value={(values.collecte_target ?? {}) as Record<string, unknown>} onSave={(v) => void save("collecte_target", v)} saving={saving === "collecte_target"} />
        </Panel>
      </div>
      <Panel title={labels.cities ?? "Villes et quartiers"}>
        <CitiesEditor value={Array.isArray(values.cities) ? (values.cities as { name: string; quartiers: string[] }[]) : []} onSave={(v) => void save("cities", v)} saving={saving === "cities"} />
      </Panel>
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

function ShareRow({ label, value, onSave, saving }: { label?: string; value: unknown; onSave: (v: number) => void; saving: boolean }) {
  const [v, setV] = useState<string | null>(null);
  const shown = v ?? String(Math.round(Number(value ?? 0) * 100));
  return (
    <form className="adRow" onSubmit={(e) => { e.preventDefault(); onSave(Number(shown) / 100); setV(null); }}>
      <label className="adFilter"><span>{label} (%)</span><input className="input" inputMode="decimal" value={shown} onChange={(e) => setV(e.target.value)} /></label>
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

function FeatureToggles({ value, onSave, saving }: { value: Record<string, unknown>; onSave: (v: Record<string, unknown>) => void; saving: boolean }) {
  const [v, setV] = useState({ ...value });
  const set = (k: string, x: unknown) => setV((p) => ({ ...p, [k]: x }));
  return (
    <form
      className="adForm"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(v);
      }}
    >
      <label className="adFilter"><span><input type="checkbox" checked={Boolean(v.tailor_verification)} onChange={(e) => set("tailor_verification", e.target.checked)} /> Vérification des tailleurs (badges et blocages)</span></label>
      <label className="adFilter"><span><input type="checkbox" checked={Boolean(v.payments)} onChange={(e) => set("payments", e.target.checked)} /> Paiements (transactions, séquestre, commissions)</span></label>
      <label className="adFilter"><span><input type="checkbox" checked={Boolean(v.negotiation)} onChange={(e) => set("negotiation", e.target.checked)} /> Négociation des prix (offres, devis)</span></label>
      <label className="adFilter">
        <span>Génération de patrons</span>
        <select className="input" value={String(v.pattern_generation ?? "preview")} onChange={(e) => set("pattern_generation", e.target.value)}>
          <option value="off">Coupée</option>
          <option value="preview">Aperçu (moteur de démonstration)</option>
          <option value="on">Activée (vrai moteur)</option>
        </select>
      </label>
      <Button variant="primary" className="adBtnSm" type="submit" disabled={saving}>Enregistrer les fonctionnalités</Button>
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
        onSave({ min_rating: num("min_rating"), max_dispute_rate: num("max_dispute_rate"), max_response_hours: num("max_response_hours"), max_late_rate: num("max_late_rate") });
      }}
    >
      <div className="adRow">
        <label className="adFilter"><span>Note min</span><input className="input" inputMode="decimal" value={String(v.min_rating ?? value.min_rating ?? "")} onChange={(e) => setV({ ...v, min_rating: e.target.value })} /></label>
        <label className="adFilter"><span>Taux de litiges max</span><input className="input" inputMode="decimal" value={String(v.max_dispute_rate ?? value.max_dispute_rate ?? "")} onChange={(e) => setV({ ...v, max_dispute_rate: e.target.value })} /></label>
      </div>
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
