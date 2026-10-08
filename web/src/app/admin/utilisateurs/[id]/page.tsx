"use client";

// Fiche d'un utilisateur (2.3 a 2.6, 2.9, 13.6, 14.11) : profil, mesures avec
// correction tracee et historique, commandes, litiges, avis, connexions,
// demandes de support, origine d'acquisition avec qualification, notes.
// Actions : suspendre/reactiver (motif), mot de passe provisoire (affiche une
// fois), export des donnees, suppression (super-admin). Version imprimable.

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { Growth, Users, type AcquisitionComment, type UserDossier } from "@/lib/api/admin";
import { Button } from "@/components/ui";
import { useAdmin } from "@/components/admin/AdminContext";
import { useFeedback } from "@/components/admin/Feedback";
import { ErrorState, Loading, Notes, PageHead, Panel, StatusBadge, useLoad } from "@/components/admin/kit";
import { ORDER_STATUS, ROLE_LABEL, USER_STATUS, ago, formatDate, formatDateTime, measureLabel } from "@/components/admin/format";

function Kv({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="adKv">
      <dt>{k}</dt>
      <dd>{v}</dd>
    </div>
  );
}

interface MeasureHistoryEntry {
  id: string;
  actor_name: string;
  reason: string;
  details: { modifications?: Record<string, { avant: number; après: number }> };
  created_at: string;
}

export default function UserDossierPage() {
  const { id } = useParams<{ id: string }>();
  const { can, me } = useAdmin();
  const { confirm, toast } = useFeedback();
  const dossier = useLoad<UserDossier>(() => Users.dossier(id), [id]);
  const [pw, setPw] = useState<string | null>(null);
  const [history, setHistory] = useState<Record<string, MeasureHistoryEntry[]>>({});
  const [qualifyOpen, setQualifyOpen] = useState(false);

  if (dossier.error) return <div className="adPage"><PageHead title="Fiche utilisateur" back={{ href: "/admin/utilisateurs", label: "Utilisateurs" }} /><ErrorState error={dossier.error} onRetry={dossier.reload} /></div>;
  if (!dossier.data) return <div className="adPage"><Loading /></div>;
  const d = dossier.data;
  const isSuper = me?.admin_role === "super_admin";

  const doActive = async (active: boolean) => {
    const reason = await confirm({
      title: active ? "Réactiver ce compte ?" : "Suspendre ce compte ?",
      body: active ? undefined : "La personne ne pourra plus se connecter. Le motif lui est communiqué.",
      danger: !active,
      confirmLabel: active ? "Réactiver" : "Suspendre",
      reason: active ? undefined : { label: "Motif communiqué à l'utilisateur", required: true },
    });
    if (reason === null) return;
    try {
      await Users.setActive(d.user.id, active, reason || undefined);
      toast(active ? "Compte réactivé." : "Compte suspendu.", active ? undefined : { undo: async () => { await Users.setActive(d.user.id, true); dossier.reload(); } });
      dossier.reload();
    } catch (e) {
      toast((e as Error).message, { error: true });
    }
  };

  const doResetPw = async () => {
    const ok = await confirm({ title: "Créer un mot de passe provisoire ?", body: "Il s'affiche une seule fois : communiquez-le à la personne, qui devra le changer à sa première connexion.", confirmLabel: "Créer" });
    if (ok === null) return;
    try {
      const r = await Users.resetPassword(d.user.id);
      setPw(r.temporary_password);
      dossier.reload();
    } catch (e) {
      toast((e as Error).message, { error: true });
    }
  };

  const doDelete = async () => {
    const reason = await confirm({
      title: "Supprimer définitivement ce compte ?",
      body: "Toutes ses données (mesures, commandes, messages…) seront effacées. Irréversible.",
      danger: true,
      confirmLabel: "Supprimer définitivement",
    });
    if (reason === null) return;
    try {
      await Users.remove(d.user.id);
      toast("Compte supprimé.", undefined);
      window.location.href = "/admin/utilisateurs";
    } catch (e) {
      toast((e as Error).message, { error: true });
    }
  };

  const loadHistory = async (mid: string) => {
    if (history[mid]) return;
    try {
      const h = (await Users.measurementHistory(mid)) as unknown as MeasureHistoryEntry[];
      setHistory((p) => ({ ...p, [mid]: h }));
    } catch (e) {
      toast((e as Error).message, { error: true });
    }
  };

  const correct = async (mid: string, data: Record<string, number>) => {
    const reason = await confirm({ title: "Corriger ces mensurations ?", body: "La correction est tracée (qui, quand, pourquoi).", confirmLabel: "Corriger", reason: { label: "Motif de la correction", required: true } });
    if (reason === null) return;
    try {
      await Users.correctMeasurement(mid, data, reason);
      toast("Mensurations corrigées.");
      dossier.reload();
    } catch (e) {
      toast((e as Error).message, { error: true });
    }
  };

  return (
    <div className="adPage">
      <PageHead
        title={d.user.full_name}
        sub={`${ROLE_LABEL[d.user.role] ?? d.user.role} · inscrit le ${formatDate(d.user.created_at)}`}
        back={{ href: "/admin/utilisateurs", label: "Utilisateurs" }}
        actions={
          <>
            <Button variant="secondary" className="adBtnSm adNoPrint" onClick={() => window.print()}>Imprimer</Button>
            {d.can.write && (
              <Button variant="secondary" className="adBtnSm adNoPrint" onClick={() => doActive(!d.user.is_active)}>
                {d.user.is_active ? "Suspendre" : "Réactiver"}
              </Button>
            )}
            {d.can.write && <Button variant="secondary" className="adBtnSm adNoPrint" onClick={doResetPw}>Mot de passe provisoire</Button>}
            {d.can.write && <Button variant="secondary" className="adBtnSm adNoPrint" onClick={() => Users.exportData(d.user.id)}>Exporter les données</Button>}
            {d.can.delete && isSuper && <Button variant="danger" className="adBtnSm adNoPrint" onClick={doDelete}>Supprimer</Button>}
          </>
        }
      />

      {pw && (
        <Panel title="Mot de passe provisoire">
          <p>Affichez-le <strong>une seule fois</strong> à la personne, puis fermez ce panneau : il ne sera plus jamais visible.</p>
          <p className="adBigCode">{pw}</p>
          <Button variant="secondary" className="adBtnSm" onClick={() => setPw(null)}>J&apos;ai communiqué le mot de passe</Button>
        </Panel>
      )}

      <div className="adGrid2">
        <Panel title="Profil">
          <dl>
            <Kv k="Téléphone" v={d.user.phone ?? "—"} />
            <Kv k="E-mail" v={d.user.email ?? "—"} />
            <Kv k="Statut" v={<StatusBadge map={USER_STATUS} value={d.user.is_guest ? "guest" : d.user.is_active ? "active" : "suspended"} />} />
            <Kv k="Ville" v={d.user.city ?? "—"} />
            <Kv k="Langue" v={d.user.language === "en" ? "Anglais" : "Français"} />
            <Kv k="Support" v={d.user.platform === "web" ? "Site web" : "Application"} />
            <Kv k="Consentement photos" v={d.user.photo_consent ? "Oui" : "Non"} />
            <Kv k="Mot de passe provisoire en attente" v={d.user.must_change_password ? "Oui" : "Non"} />
            <Kv k="Dernière connexion" v={d.user.last_login_at ? <span title={formatDateTime(d.user.last_login_at)}>{ago(d.user.last_login_at)}</span> : "—"} />
            <Kv k="Dernière activité" v={d.user.last_seen_at ? <span title={formatDateTime(d.user.last_seen_at)}>{ago(d.user.last_seen_at)}</span> : "—"} />
            {d.tailor_profile && <Kv k="Atelier" v={`${d.tailor_profile.shop_name} (${d.tailor_profile.city ?? "—"})`} />}
          </dl>
        </Panel>

        <Panel title="Origine d'acquisition">
          {d.acquisition ? (
            <dl>
              <Kv k="Canal" v={d.acquisition.channel ?? d.acquisition.self_reported ?? "—"} />
              <Kv k="Campagne" v={d.acquisition.campaign ?? "—"} />
              <Kv k="Prescripteur" v={d.acquisition.referrer ?? "—"} />
              <Kv k="Qualifié" v={d.acquisition.qualified ? `Oui${d.acquisition.qualified_at ? ` le ${formatDate(d.acquisition.qualified_at)}` : ""}` : "Non"} />
            </dl>
          ) : (
            <p className="adHint">Origine inconnue.</p>
          )}
          {d.can.write && can("growth") && (
            <Button variant="secondary" className="adBtnSm adNoPrint" onClick={() => setQualifyOpen((v) => !v)}>Qualifier l&apos;origine</Button>
          )}
          {qualifyOpen && (
            <QualifyForm
              userId={d.user.id}
              onDone={() => {
                setQualifyOpen(false);
                dossier.reload();
              }}
            />
          )}
          {d.acquisition_comments.length > 0 && (
            <ul className="adList">
              {d.acquisition_comments.map((c: AcquisitionComment) => (
                <li key={c.id}>
                  <strong>{c.author_name}</strong> <span className="adHint">{formatDateTime(c.created_at)}</span>
                  <div>{c.body ?? `${c.channel ?? ""} ${c.campaign ?? ""} ${c.referrer ?? ""}`}</div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel title={`Mensurations (${d.measurements.length})`}>
        {d.measurements.length === 0 ? (
          <p className="adHint">Aucune mensuration.</p>
        ) : (
          d.measurements.map((m) => (
            <details key={m.id} className="adDetails" onToggle={(e) => { if ((e.target as HTMLDetailsElement).open) void loadHistory(m.id); }}>
              <summary>
                {formatDate(m.created_at)} · {m.source} · {Object.keys(m.data).length} mesures
                {m.is_default ? " · par défaut" : ""}
              </summary>
              <MeasureEditor mid={m.id} initial={m.data} onCorrect={d.can.write ? correct : undefined} />
              {history[m.id] && history[m.id].length > 0 && (
                <div>
                  <h4>Historique des corrections</h4>
                  <ul className="adList">
                    {history[m.id].map((h) => (
                      <li key={h.id}>
                        <strong>{h.actor_name}</strong> <span className="adHint">{formatDateTime(h.created_at)}</span> — {h.reason}
                        {h.details?.modifications && (
                          <ul>
                            {Object.entries(h.details.modifications).map(([k, v]: [string, { avant: number; après: number }]) => (
                              <li key={k}>{measureLabel(k)} : {v.avant} → <strong>{v.après}</strong> cm</li>
                            ))}
                          </ul>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </details>
          ))
        )}
        {d.measurement_sessions.length > 0 && (
          <>
            <h4>Sessions d&apos;analyse</h4>
            <ul className="adList">
              {d.measurement_sessions.map((s) => (
                <li key={s.id}>
                  <Link href={`/admin/mesure/${s.id}`}>{formatDateTime(s.created_at)}</Link> — {s.status}
                  {s.error_message ? ` : ${s.error_message}` : ""}
                </li>
              ))}
            </ul>
          </>
        )}
      </Panel>

      <div className="adGrid2">
        <Panel title={`Commandes (${d.orders.length})`}>
          {d.orders.length === 0 ? <p className="adHint">Aucune.</p> : (
            <ul className="adList">
              {d.orders.map((o) => (
                <li key={o.id}>
                  <Link href={`/admin/commandes/${o.id}`}>Commande {o.id.slice(0, 8).toUpperCase()}</Link>{" "}
                  <StatusBadge map={ORDER_STATUS} value={o.status} />{" "}
                  <span className="adHint">{formatDate(o.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title={`Litiges (${d.disputes.length})`}>
          {d.disputes.length === 0 ? <p className="adHint">Aucun.</p> : (
            <ul className="adList">
              {d.disputes.map((o) => (
                <li key={o.id}>
                  <Link href={`/admin/litiges/${o.id}`}>Commande {o.id.slice(0, 8).toUpperCase()}</Link>{" "}
                  <span className="adHint">{o.dispute_category ?? ""} · {formatDate(o.dispute_opened_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="adGrid2">
        <Panel title={`Avis (${d.reviews_given.length + d.reviews_received.length})`}>
          {d.reviews_given.length === 0 && d.reviews_received.length === 0 ? <p className="adHint">Aucun.</p> : (
            <ul className="adList">
              {d.reviews_given.map((r) => <li key={r.id}>Donné : {r.stars}★ — {r.comment ?? "sans commentaire"}</li>)}
              {d.reviews_received.map((r) => <li key={r.id}>Reçu : {r.stars}★ — {r.comment ?? "sans commentaire"} ({r.moderation_status})</li>)}
            </ul>
          )}
        </Panel>
        <Panel title={`Connexions (${d.logins.length})`}>
          {d.logins.length === 0 ? <p className="adHint">Aucune trace.</p> : (
            <ul className="adList">
              {d.logins.slice(0, 20).map((l) => (
                <li key={l.id}>
                  {formatDateTime(l.created_at)} · {l.method} · {l.platform ?? "?"} · {l.success ? "réussie" : "échouée"}
                  {l.ip ? ` · ${l.ip}` : ""}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel title={`Demandes de support (${d.tickets.length})`}>
        {d.tickets.length === 0 ? <p className="adHint">Aucune.</p> : (
          <ul className="adList">
            {d.tickets.map((t) => (
              <li key={t.id}>
                <Link href={`/admin/support/${t.id}`}>#{t.number} {t.subject}</Link>{" "}
                <span className="adHint">{t.status} · {formatDate(t.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Notes entityType="user" entityId={d.user.id} />
    </div>
  );
}

function MeasureEditor({ mid, initial, onCorrect }: { mid: string; initial: Record<string, number>; onCorrect?: (mid: string, data: Record<string, number>) => void }) {
  const [draft, setDraft] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(initial).map(([k, v]) => [k, String(v)])));
  if (!onCorrect) {
    return (
      <dl className="adMeasureGrid">
        {Object.entries(initial).map(([k, v]) => <Kv key={k} k={measureLabel(k)} v={`${v} cm`} />)}
      </dl>
    );
  }
  return (
    <div>
      <div className="adMeasureGrid">
        {Object.entries(draft).map(([k, v]) => (
          <label key={k} className="adFilter">
            <span>{measureLabel(k)}</span>
            <input className="input" inputMode="decimal" value={v} onChange={(e) => setDraft((p) => ({ ...p, [k]: e.target.value }))} />
          </label>
        ))}
      </div>
      <Button
        variant="secondary"
        className="adBtnSm adNoPrint"
        onClick={() => {
          const data: Record<string, number> = {};
          for (const [k, v] of Object.entries(draft)) {
            const n = Number(String(v).replace(",", "."));
            if (!Number.isFinite(n)) return;
            data[k] = n;
          }
          void onCorrect(mid, data);
        }}
      >
        Enregistrer la correction
      </Button>
    </div>
  );
}

function QualifyForm({ userId, onDone }: { userId: string; onDone: () => void }) {
  const { toast } = useFeedback();
  const [channelId, setChannelId] = useState("");
  const [referrer, setReferrer] = useState("");
  const [body, setBody] = useState("");
  const channels = useLoad(() => Growth.channels(), []);
  return (
    <form
      className="adForm adNoPrint"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await Growth.qualify(userId, { channel_id: channelId || null, referrer: referrer || undefined, body: body || undefined });
          toast("Origine qualifiée.");
          onDone();
        } catch (err) {
          toast((err as Error).message, { error: true });
        }
      }}
    >
      <label className="adFilter">
        <span>Canal</span>
        <select className="input" value={channelId} onChange={(e) => setChannelId(e.target.value)}>
          <option value="">—</option>
          {(channels.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      <label className="adFilter">
        <span>Prescripteur</span>
        <input className="input" value={referrer} onChange={(e) => setReferrer(e.target.value)} placeholder="Stand, nom…" />
      </label>
      <label className="adFilter">
        <span>Commentaire</span>
        <textarea className="input adTextarea" value={body} onChange={(e) => setBody(e.target.value)} />
      </label>
      <Button variant="primary" className="adBtnSm" type="submit">Qualifier</Button>
    </form>
  );
}
