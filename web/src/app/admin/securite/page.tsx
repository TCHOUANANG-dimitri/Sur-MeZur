"use client";

// Mon compte (M13) : double authentification (cle affichee et QR genere cote
// navigateur, sans dependance lourde), sessions ouvertes.

import { useState } from "react";
import { Security } from "@/lib/api/admin";
import { Button } from "@/components/ui";
import { useAdmin } from "@/components/admin/AdminContext";
import { useFeedback } from "@/components/admin/Feedback";
import { ErrorState, Loading, PageHead, Panel, useLoad } from "@/components/admin/kit";
import { formatDateTime } from "@/components/admin/format";
import { qrSvg } from "@/lib/qr";

export default function SecurityPage() {
  const { me, reloadMe } = useAdmin();
  const { confirm, toast } = useFeedback();
  const sessions = useLoad(() => Security.sessions(true), []);
  const [setup, setSetup] = useState<{ secret: string; otpauth_uri: string } | null>(null);
  const [code, setCode] = useState("");
  const [qrError, setQrError] = useState(false);

  const startSetup = async () => {
    try {
      const r = await Security.setup2fa();
      setSetup(r);
      setQrError(false);
    } catch (e) {
      toast((e as Error).message, { error: true });
    }
  };

  const enable = async () => {
    if (!setup) return;
    try {
      await Security.enable2fa(code.trim());
      toast("Double authentification activée.");
      setSetup(null);
      setCode("");
      void reloadMe();
    } catch (e) {
      toast((e as Error).message, { error: true });
    }
  };

  const disable = async () => {
    const answer = await confirm({
      title: "Désactiver la double authentification ?",
      body: "Un simple mot de passe suffira de nouveau. À ne faire que si vous perdez l'accès à votre application d'authentification (sinon, utilisez-la).",
      danger: true,
      confirmLabel: "Désactiver",
      reason: { label: "Code actuel (vérification)", required: true },
    });
    if (answer === null) return;
    try {
      await Security.disable2fa(answer.trim());
      toast("Double authentification désactivée.");
      void reloadMe();
    } catch (e) {
      toast((e as Error).message, { error: true });
    }
  };

  const revoke = async (id: string, mine: boolean) => {
    if ((await confirm({ title: mine ? "Fermer cette session ?" : "Révoquer cette session ?", danger: true, confirmLabel: "Révoquer" })) === null) return;
    try {
      await Security.revokeSession(id);
      toast("Session fermée.");
      sessions.reload();
    } catch (e) {
      toast((e as Error).message, { error: true });
    }
  };

  const revokeOthers = async () => {
    if ((await confirm({ title: "Fermer toutes les autres sessions ?", danger: true, confirmLabel: "Tout fermer" })) === null) return;
    try {
      const r = await Security.revokeOthers();
      toast(`${r.revoked} session(s) fermée(s).`);
      sessions.reload();
    } catch (e) {
      toast((e as Error).message, { error: true });
    }
  };

  let qr = "";
  if (setup && !qrError) {
    try {
      qr = qrSvg(setup.otpauth_uri, 220);
    } catch {
      setQrError(true);
    }
  }

  return (
    <div className="adPage">
      <PageHead title="Mon compte" sub="Double authentification et sessions ouvertes." />
      <Panel title="Double authentification">
        {me?.totp_enabled ? (
          <>
            <p>Activée sur votre compte : chaque connexion demande le code en plus du mot de passe.</p>
            <Button variant="secondary" className="adBtnSm" onClick={() => void disable()}>Désactiver</Button>
          </>
        ) : setup ? (
          <>
            <p>Scannez ce code avec votre application d&apos;authentification, puis saisissez le code affiché.</p>
            {qr ? (
              <div dangerouslySetInnerHTML={{ __html: qr }} />
            ) : (
              <p className="adWarn">QR illisible : saisissez la clé à la main.</p>
            )}
            <p>Clé (saisie manuelle) : <code className="adCode">{setup.secret}</code>{" "}
              <Button variant="secondary" className="adBtnSm" onClick={() => void navigator.clipboard?.writeText(setup.secret)}>Copier</Button>
            </p>
            <div className="adRow">
              <label className="adFilter"><span>Code affiché par l&apos;application</span><input className="input" inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" /></label>
              <Button variant="primary" className="adBtnSm" onClick={() => void enable()} disabled={code.trim().length < 6}>Activer</Button>
              <Button variant="secondary" className="adBtnSm" onClick={() => setSetup(null)}>Annuler</Button>
            </div>
          </>
        ) : (
          <>
            <p className="adHint">Recommandée : même avec votre mot de passe, personne ne se connecte sans votre téléphone.</p>
            <Button variant="primary" className="adBtnSm" onClick={() => void startSetup()}>Activer la double authentification</Button>
          </>
        )}
      </Panel>
      <Panel
        title="Sessions ouvertes"
        actions={<Button variant="secondary" className="adBtnSm" onClick={() => void revokeOthers()}>Fermer les autres</Button>}
      >
        {sessions.error ? <ErrorState error={sessions.error} onRetry={sessions.reload} /> : !sessions.data ? <Loading /> : sessions.data.sessions.length === 0 ? (
          <p className="adHint">Aucune session.</p>
        ) : (
          <ul className="adList">
            {sessions.data.sessions.map((x) => (
              <li key={x.id}>
                <strong>{x.full_name}</strong> <span className="adHint">{x.ip ?? "?"} · {(x.user_agent ?? "").slice(0, 60)} · depuis le {formatDateTime(x.created_at)}{x.current ? " · cette session" : ""}</span>{" "}
                {!x.current && <button className="adLinkBtn adDanger" onClick={() => void revoke(x.id, false)}>révoquer</button>}
              </li>
            ))}
          </ul>
        )}
        <p className="adHint">Inactivité : déconnexion après {sessions.data?.idle_minutes ?? me?.idle_minutes ?? "—"} minute(s).</p>
      </Panel>
    </div>
  );
}
