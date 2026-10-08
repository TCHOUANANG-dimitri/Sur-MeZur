"use client";

// Comptes probablement en double (2.8) : choix du compte conserve, fusion
// des comptes clients.

import Link from "next/link";
import { useState } from "react";
import { Users, type DuplicatePair } from "@/lib/api/admin";
import { Button } from "@/components/ui";
import { useFeedback } from "@/components/admin/Feedback";
import { ErrorState, Loading, PageHead, Panel, useLoad } from "@/components/admin/kit";
import { ROLE_LABEL, formatDate } from "@/components/admin/format";

export default function DuplicatesPage() {
  const { confirm, toast } = useFeedback();
  const pairs = useLoad<{ pairs: DuplicatePair[] }>(() => Users.duplicates(), []);
  const [busy, setBusy] = useState<string | null>(null);

  const merge = async (pair: DuplicatePair, keepId: string) => {
    const other = pair.users.find((u) => u.id !== keepId);
    const ok = await confirm({
      title: "Fusionner ces deux comptes ?",
      body: `Le compte conservé garde les mesures, commandes et avis des deux. L'autre compte est désactivé.${other && !other.is_active ? " (déjà inactif)" : ""}`,
      danger: true,
      confirmLabel: "Fusionner",
    });
    if (ok === null || !other) return;
    setBusy(pair.users.map((u) => u.id).join());
    try {
      await Users.merge(keepId, other.id);
      toast("Comptes fusionnés.");
      pairs.reload();
    } catch (e) {
      toast((e as Error).message, { error: true });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="adPage">
      <PageHead title="Comptes en double" sub="Même personne, deux comptes : conservez-en un, l'autre est absorbé." back={{ href: "/admin/utilisateurs", label: "Utilisateurs" }} />
      {pairs.error ? (
        <ErrorState error={pairs.error} onRetry={pairs.reload} />
      ) : !pairs.data ? (
        <Loading />
      ) : pairs.data.pairs.length === 0 ? (
        <Panel title="Aucun doublon probable"><p className="adHint">Rien à fusionner pour l&apos;instant.</p></Panel>
      ) : (
        pairs.data.pairs.map((p, i) => {
          const key = p.users.map((u) => u.id).join();
          return (
            <Panel key={key} title={`Paire ${i + 1} — ressemblance ${Math.round(p.score * 100)} %`}>
              <p className="adHint">{p.reasons.join(" · ")}</p>
              <div className="adGrid2">
                {p.users.map((u) => (
                  <div key={u.id} className="adCard">
                    <strong><Link href={`/admin/utilisateurs/${u.id}`}>{u.full_name}</Link></strong>
                    <div className="adHint">{u.phone} · {ROLE_LABEL[u.role] ?? u.role} · inscrit le {formatDate(u.created_at)} · {u.is_active ? "actif" : "inactif"}</div>
                    <Button variant="secondary" className="adBtnSm" disabled={busy === key} onClick={() => void merge(p, u.id)}>
                      Conserver celui-ci
                    </Button>
                  </div>
                ))}
              </div>
            </Panel>
          );
        })
      )}
    </div>
  );
}
