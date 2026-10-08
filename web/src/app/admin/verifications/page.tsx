"use client";

// Verifications des tailleurs (3.1 a 3.5) : visionneuse (zoom, rotation, cote
// a cote), decision motivee avec modeles de messages, demande de complement,
// historique. Masquee du menu quand tailor_verification=false, avec un
// bandeau « desactivee ».

import { useState } from "react";
import { Comms, Tailors, type VerificationDossier, type VerificationRow } from "@/lib/api/admin";
import { Button } from "@/components/ui";
import { useAdmin } from "@/components/admin/AdminContext";
import { useFeedback } from "@/components/admin/Feedback";
import { useUrlState } from "@/components/admin/DataTable";
import { AuthImage, ErrorState, Loading, Notes, PageHead, Panel, StatusBadge, useLoad } from "@/components/admin/kit";
import { VERIFICATION_STATUS, formatDateTime } from "@/components/admin/format";

export default function VerificationsPage() {
  const { features } = useAdmin();
  const [s, set] = useUrlState({ status: "pending", id: "" });
  const list = useLoad(() => Tailors.verifications(s.status || undefined), [s.status]);

  if (!features.tailor_verification) {
    return (
      <div className="adPage">
        <PageHead title="Vérifications" sub="File des demandes de vérification des tailleurs." />
        <Panel title="Vérification désactivée">
          <p>
            La vérification des tailleurs est <strong>désactivée</strong> : aucun tailleur n&apos;est bloqué
            et les badges « vérifié » ne sont plus affichés comme une garantie.
            Les demandes déjà reçues restent consultables ci-dessous, et la file se remplira
            à nouveau si la fonctionnalité est rallumée dans les réglages.
          </p>
        </Panel>
        <QueueList status={s.status} onStatus={(status) => set({ status })} list={list} onOpen={(id) => set({ id })} selected={s.id} />
        {s.id && <Dossier id={s.id} onClose={() => set({ id: "" })} onDone={() => { list.reload(); set({ id: "" }); }} />}
      </div>
    );
  }

  return (
    <div className="adPage">
      <PageHead title="Vérifications" sub="Pièces d'identité et photos d'atelier : décidez, motivez, tracez." />
      <QueueList status={s.status} onStatus={(status) => set({ status })} list={list} onOpen={(id) => set({ id })} selected={s.id} />
      {s.id && <Dossier id={s.id} onClose={() => set({ id: "" })} onDone={() => { list.reload(); set({ id: "" }); }} />}
    </div>
  );
}

function QueueList({ status, onStatus, list, onOpen, selected }: {
  status: string;
  onStatus: (s: string) => void;
  list: { data: VerificationRow[] | null; error: unknown; reload: () => void };
  onOpen: (id: string) => void;
  selected: string;
}) {
  return (
    <Panel
      title="File"
      actions={
        <div className="adTabs" role="tablist">
          {[
            { key: "pending", label: "En attente" },
            { key: "info_requested", label: "Compléments" },
            { key: "approved", label: "Vérifiés" },
            { key: "rejected", label: "Refusés" },
            { key: "", label: "Tous" },
          ].map((t) => (
            <button key={t.key} role="tab" aria-selected={status === t.key} className={`adTab ${status === t.key ? "adTabActive" : ""}`} onClick={() => onStatus(t.key)}>
              {t.label}
            </button>
          ))}
        </div>
      }
    >
      {list.error ? (
        <ErrorState error={list.error} onRetry={list.reload} />
      ) : !list.data ? (
        <Loading />
      ) : list.data.length === 0 ? (
        <p className="adHint">File vide.</p>
      ) : (
        <ul className="adList">
          {list.data.map((r) => (
            <li key={r.id}>
              <button className={`adLinkBtn ${selected === r.id ? "adActive" : ""}`} onClick={() => onOpen(r.id)}>
                <strong>{r.shop_name}</strong> — {r.full_name} · {r.phone} · {r.city ?? "—"}
              </button>{" "}
              <StatusBadge map={VERIFICATION_STATUS} value={r.verification_status} />{" "}
              <span className="adHint">{formatDateTime(r.updated_at)}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function Dossier({ id, onClose, onDone }: { id: string; onClose: () => void; onDone: () => void }) {
  const { confirm, toast } = useFeedback();
  const d = useLoad<VerificationDossier>(() => Tailors.dossier(id), [id]);
  const templates = useLoad(() => Comms.templates("verification"), []);
  const [reason, setReason] = useState("");
  const [missing, setMissing] = useState("");
  const [zoom, setZoom] = useState(1);
  const [rotate, setRotate] = useState(0);
  const [compare, setCompare] = useState<string | null>(null);

  const decide = async (status: "approved" | "rejected") => {
    const answer = await confirm({
      title: status === "approved" ? "Vérifier ce tailleur ?" : "Refuser cette vérification ?",
      body: status === "approved" ? "Le badge « vérifié » sera affiché sur son profil." : "Le tailleur recevra le motif.",
      danger: status === "rejected",
      confirmLabel: status === "approved" ? "Vérifier" : "Refuser",
      reason: { label: "Motif (communiqué au tailleur)", required: true, initial: reason },
    });
    if (answer === null) return;
    try {
      await Tailors.decide(id, status, answer);
      toast(status === "approved" ? "Tailleur vérifié." : "Vérification refusée.");
      onDone();
    } catch (e) {
      toast((e as Error).message, { error: true });
    }
  };

  const askInfo = async () => {
    if (!missing.trim() && !reason.trim()) {
      toast("Indiquez les pièces manquantes ou un message.", { error: true });
      return;
    }
    try {
      await Tailors.requestInfo(
        id,
        missing.split(",").map((x) => x.trim()).filter(Boolean),
        reason.trim()
      );
      toast("Complément demandé au tailleur.");
      onDone();
    } catch (e) {
      toast((e as Error).message, { error: true });
    }
  };

  return (
    <Panel
      title={d.data ? `Dossier — ${d.data.tailor.shop_name}` : "Dossier"}
      actions={<Button variant="secondary" className="adBtnSm" onClick={onClose}>Fermer</Button>}
    >
      {d.error ? (
        <ErrorState error={d.error} onRetry={d.reload} />
      ) : !d.data ? (
        <Loading />
      ) : (
        <>
          <p>
            <strong>{d.data.user?.full_name}</strong> · {d.data.user?.phone} · {d.data.tailor.city ?? "—"}
            {d.data.tailor.quartier ? ` · ${d.data.tailor.quartier}` : ""} —{" "}
            <StatusBadge map={VERIFICATION_STATUS} value={d.data.tailor.verification_status} />
          </p>
          {d.data.tailor.bio && <p className="adHint">{d.data.tailor.bio}</p>}

          <div className="adToolbar adNoPrint">
            <Button variant="secondary" className="adBtnSm" onClick={() => setZoom((z) => Math.min(3, +(z + 0.25).toFixed(2)))}>Zoom +</Button>
            <Button variant="secondary" className="adBtnSm" onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))}>Zoom −</Button>
            <Button variant="secondary" className="adBtnSm" onClick={() => setRotate((r) => (r + 90) % 360)}>Pivoter 90°</Button>
            <span className="adHint">Cliquez une pièce pour la comparer côte à côte.</span>
          </div>
          <div className="adDocGrid">
            {d.data.documents.map((doc) => (
              <figure key={doc.id} className="adDoc">
                <button className="adDocBtn" onClick={() => setCompare(compare === doc.file_url ? null : doc.file_url)} aria-label={`Comparer ${doc.label}`}>
                  <AuthImage
                    src={doc.file_url}
                    alt={doc.label}
                    style={{ transform: `scale(${zoom}) rotate(${rotate}deg)`, maxWidth: "100%" }}
                  />
                </button>
                <figcaption>{doc.label} · {formatDateTime(doc.created_at)}</figcaption>
              </figure>
            ))}
          </div>
          {compare && (
            <div className="adDocGrid">
              <figure className="adDoc">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={compare} alt="Comparaison" style={{ maxWidth: "100%" }} />
                <figcaption>Référence côte à côte</figcaption>
              </figure>
            </div>
          )}
          {d.data.documents.length === 0 && <p className="adHint">Aucune pièce fournie.</p>}

          <h4>Décision motivée</h4>
          {(templates.data?.items ?? []).length > 0 && (
            <label className="adFilter adNoPrint">
              <span>Modèle de message</span>
              <select
                className="input"
                value=""
                onChange={(e) => {
                  const t = (templates.data?.items ?? []).find((x) => x.id === e.target.value);
                  if (t) setReason(t.body);
                }}
              >
                <option value="">Insérer un modèle…</option>
                {(templates.data?.items ?? []).map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
              </select>
            </label>
          )}
          <textarea className="input adTextarea" placeholder="Motif communiqué au tailleur…" value={reason} onChange={(e) => setReason(e.target.value)} />
          <div className="adRow adNoPrint" style={{ marginTop: 8 }}>
            <Button variant="primary" className="adBtnSm" onClick={() => void decide("approved")}>Vérifier</Button>
            <Button variant="danger" className="adBtnSm" onClick={() => void decide("rejected")}>Refuser</Button>
          </div>

          <h4>Demander un complément</h4>
          <label className="adFilter">
            <span>Pièces manquantes (séparées par des virgules)</span>
            <input className="input" value={missing} onChange={(e) => setMissing(e.target.value)} placeholder="pièce d'identité, photo d'atelier" />
          </label>
          <div className="adRow adNoPrint" style={{ marginTop: 8 }}>
            <Button variant="secondary" className="adBtnSm" onClick={() => void askInfo()}>Demander le complément</Button>
          </div>

          <h4>Historique</h4>
          {d.data.history.length === 0 ? <p className="adHint">Aucune décision enregistrée.</p> : (
            <ul className="adList">
              {d.data.history.map((h) => (
                <li key={h.id}>
                  <strong>{h.action}</strong> <span className="adHint">{formatDateTime(h.created_at)}{h.actor_name ? ` · ${h.actor_name}` : ""}</span>
                  {h.reason && <div>{h.reason}</div>}
                  {h.missing_documents.length > 0 && <div className="adHint">Manquants : {h.missing_documents.join(", ")}</div>}
                </li>
              ))}
            </ul>
          )}
          <Notes entityType="tailor" entityId={d.data.tailor.id} />
        </>
      )}
    </Panel>
  );
}
