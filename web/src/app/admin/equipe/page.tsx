"use client";

// Equipe et roles (13.1, 13.2) : membres, creation avec mot de passe
// provisoire, activation, reinitialisation de la double authentification.

import { useState } from "react";
import { Security, type TeamMember } from "@/lib/api/admin";
import { Button } from "@/components/ui";
import { useAdmin } from "@/components/admin/AdminContext";
import { useFeedback } from "@/components/admin/Feedback";
import { ErrorState, Loading, PageHead, Panel, useLoad } from "@/components/admin/kit";
import { formatDate } from "@/components/admin/format";

export default function TeamPage() {
  const { me } = useAdmin();
  const { confirm, toast } = useFeedback();
  const team = useLoad(() => Security.team(), []);
  const [form, setForm] = useState({ full_name: "", phone: "", email: "", admin_role: "support" });
  const [tempPw, setTempPw] = useState<{ name: string; pw: string } | null>(null);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const r = await Security.createMember({
        full_name: form.full_name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim() || undefined,
        admin_role: form.admin_role,
      });
      setTempPw({ name: r.member.full_name, pw: r.temporary_password });
      setForm({ full_name: "", phone: "", email: "", admin_role: "support" });
      toast("Membre créé.");
      team.reload();
    } catch (err) {
      toast((err as Error).message, { error: true });
    }
  };

  const toggle = async (m: TeamMember) => {
    const answer = await confirm({
      title: m.is_active ? `Désactiver ${m.full_name} ?` : `Réactiver ${m.full_name} ?`,
      danger: m.is_active,
      confirmLabel: "Appliquer",
    });
    if (answer === null) return;
    try {
      await Security.updateMember(m.id, { is_active: !m.is_active });
      toast("Membre mis à jour.");
      team.reload();
    } catch (e) {
      toast((e as Error).message, { error: true });
    }
  };

  const reset2fa = async (m: TeamMember) => {
    const answer = await confirm({
      title: `Réinitialiser la double authentification de ${m.full_name} ?`,
      body: "À utiliser quand la personne a perdu son téléphone : elle reconfigurera un code à sa prochaine connexion.",
      danger: true,
      confirmLabel: "Réinitialiser",
    });
    if (answer === null) return;
    try {
      await Security.resetMember2fa(m.id);
      toast("Double authentification réinitialisée.");
      team.reload();
    } catch (e) {
      toast((e as Error).message, { error: true });
    }
  };

  return (
    <div className="adPage">
      <PageHead title="Équipe et rôles" sub="Comptes administrateurs, rôles et accès." />
      {tempPw && (
        <Panel title="Mot de passe provisoire">
          <p>Communiquez-le <strong>une seule fois</strong> à {tempPw.name}, qui devra le changer à sa première connexion.</p>
          <p className="adBigCode">{tempPw.pw}</p>
          <Button variant="secondary" className="adBtnSm" onClick={() => setTempPw(null)}>Communiqué</Button>
        </Panel>
      )}
      {team.error ? <ErrorState error={team.error} onRetry={team.reload} /> : !team.data ? <Loading /> : (
        <Panel title={`Membres (${team.data.members.length})`}>
          <ul className="adList">
            {team.data.members.map((m) => (
              <li key={m.id}>
                <strong>{m.full_name}</strong> <span className="adHint">· {m.phone} · {m.admin_role_label}{!m.is_active && " · désactivé"}{m.totp_enabled ? " · 2FA" : ""}{m.open_sessions > 0 && ` · ${m.open_sessions} session(s)`} · vu {m.last_seen_at ? formatDate(m.last_seen_at) : "jamais"}</span>{" "}
                {m.id !== me?.id && (
                  <>
                    <button className="adLinkBtn" onClick={() => void toggle(m)}>{m.is_active ? "désactiver" : "réactiver"}</button>{" "}
                    {m.totp_enabled && <button className="adLinkBtn adDanger" onClick={() => void reset2fa(m)}>réinitialiser la 2FA</button>}
                  </>
                )}
              </li>
            ))}
          </ul>
          <p className="adHint">Rôles : {Object.values(team.data.roles).join(", ")}.</p>
        </Panel>
      )}
      <Panel title="Nouveau membre">
        <form className="adForm" onSubmit={(e) => void create(e)}>
          <div className="adRow">
            <label className="adFilter"><span>Nom complet</span><input className="input" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required minLength={2} /></label>
            <label className="adFilter"><span>Téléphone</span><input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required /></label>
          </div>
          <div className="adRow">
            <label className="adFilter"><span>E-mail (facultatif)</span><input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
            <label className="adFilter">
              <span>Rôle</span>
              <select className="input" value={form.admin_role} onChange={(e) => setForm({ ...form, admin_role: e.target.value })}>
                {(team.data ? Object.entries(team.data.roles) : [["support", "Support"]]).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
          </div>
          <Button variant="primary" className="adBtnSm" type="submit">Créer le membre</Button>
        </form>
      </Panel>
    </div>
  );
}
