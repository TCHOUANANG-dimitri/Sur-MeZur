"use client";

// Paliers de commission (M6) : fourchette de prix et taux associe.
// Code conserve, masque du menu quand payments=false.

import { useState } from "react";
import { Payments } from "@/lib/api/admin";
import { Button } from "@/components/ui";
import { useAdmin } from "@/components/admin/AdminContext";
import { useFeedback } from "@/components/admin/Feedback";
import { ErrorState, Loading, PageHead, Panel, useLoad } from "@/components/admin/kit";
import { formatFcfa, formatNumber } from "@/components/admin/format";

export default function CommissionPage() {
  const { features } = useAdmin();
  const { confirm, toast } = useFeedback();
  const tiers = useLoad(() => Payments.tiers(), []);
  const [min, setMin] = useState("");
  const [max, setMax] = useState("");
  const [rate, setRate] = useState("");

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const min_price = Number(min);
    const max_price = max.trim() === "" ? null : Number(max);
    const r = Number(rate);
    if (!Number.isFinite(min_price) || min_price < 0 || (max_price !== null && (!Number.isFinite(max_price) || max_price <= min_price)) || !Number.isFinite(r) || r < 0 || r > 1) {
      toast("Valeurs invalides (taux entre 0 et 1).", { error: true });
      return;
    }
    try {
      await Payments.createTier({ min_price, max_price, rate: r });
      toast("Palier créé.");
      setMin("");
      setMax("");
      setRate("");
      tiers.reload();
    } catch (err) {
      toast((err as Error).message, { error: true });
    }
  };

  return (
    <div className="adPage">
      <PageHead title="Commission" sub="Paliers appliqués au montant convenu des commandes." back={{ href: "/admin/paiements", label: "Paiements" }} />
      {!features.payments && (
        <Panel title="Paiements désactivés">
          <p className="adHint">Ces paliers ne s&apos;appliquent à rien tant que les paiements sont coupés. Ils serviront à la réactivation.</p>
        </Panel>
      )}
      {tiers.error ? <ErrorState error={tiers.error} onRetry={tiers.reload} /> : !tiers.data ? <Loading /> : (
        <Panel title="Paliers">
          {tiers.data.length === 0 ? <p className="adHint">Aucun palier configuré.</p> : (
            <ul className="adList">
              {tiers.data.map((t) => (
                <li key={t.id}>
                  {formatFcfa(t.min_price)} — {t.max_price != null ? formatFcfa(t.max_price) : "∞"} : <strong>{formatNumber(t.rate * 100, 0)} %</strong>{" "}
                  <button
                    className="adLinkBtn adDanger"
                    onClick={async () => {
                      if ((await confirm({ title: "Supprimer ce palier ?", danger: true, confirmLabel: "Supprimer" })) === null) return;
                      try {
                        await Payments.deleteTier(t.id);
                        toast("Palier supprimé.");
                        tiers.reload();
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
        </Panel>
      )}
      <Panel title="Nouveau palier">
        <form className="adRow" onSubmit={(e) => void save(e)}>
          <label className="adFilter"><span>À partir de (FCFA)</span><input className="input" inputMode="numeric" value={min} onChange={(e) => setMin(e.target.value)} required /></label>
          <label className="adFilter"><span>Jusqu&apos;à (vide = ∞)</span><input className="input" inputMode="numeric" value={max} onChange={(e) => setMax(e.target.value)} /></label>
          <label className="adFilter"><span>Taux (0–1)</span><input className="input" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="0.08" required /></label>
          <Button variant="primary" className="adBtnSm" type="submit">Créer</Button>
        </form>
      </Panel>
    </div>
  );
}
