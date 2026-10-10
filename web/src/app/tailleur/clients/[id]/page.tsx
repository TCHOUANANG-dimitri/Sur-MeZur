"use client";

/**
 * Fiche d'un client du carnet (B3.2) : appeler, WhatsApp, notes, historique
 * des mesures et des travaux, nouvelle mesure (photo ou metre), fiche
 * imprimable et partageable par WhatsApp (lien public en lecture seule,
 * qui expire).
 */

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { TailorApi } from "@/lib/api/tailor";
import type { ClientMeasurement, TailorClient, TailorJob } from "@/lib/api/tailor";
import { formatCm, presentableGroups } from "@/lib/measurements";
import { Button, Card, EmptyState, ErrorBanner, PageHeader, Spinner, Textarea } from "@/components/ui";
import { IconMeasure, IconPhone, IconPrint } from "@/components/icons";
import { JobBadge, ManualMeasureForm, dueLabel, formatDateFR } from "../../_components";

function waNumber(phone: string): string {
  return phone.replace(/[^0-9]/g, "");
}

export default function ClientDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [client, setClient] = useState<TailorClient | null>(null);
  const [measurements, setMeasurements] = useState<ClientMeasurement[] | null>(null);
  const [jobs, setJobs] = useState<TailorJob[] | null>(null);
  const [error, setError] = useState("");
  const [notes, setNotes] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [savingManual, setSavingManual] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const c = await TailorApi.client(id);
      setClient(c);
      setNotes(c.notes ?? "");
      const [mes, jb] = await Promise.all([
        TailorApi.clientMeasurements(id).catch(() => []),
        TailorApi.jobs({ client_id: id }).catch(() => []),
      ]);
      setMeasurements(mes);
      setJobs(jb);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chargement impossible.");
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveNotes() {
    if (!id) return;
    setSavingNotes(true);
    try {
      const updated = await TailorApi.patchClient(id, { notes: notes.trim() || null });
      setClient(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Enregistrement impossible.");
    } finally {
      setSavingNotes(false);
    }
  }

  async function saveManual(data: Record<string, number>, heightCm: number) {
    if (!id) return;
    setSavingManual(true);
    try {
      await TailorApi.addManualMeasurements(id, { data, height_cm: heightCm });
      setShowManual(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Enregistrement impossible.");
    } finally {
      setSavingManual(false);
    }
  }

  async function share() {
    if (!id) return;
    setSharing(true);
    try {
      const link = await TailorApi.shareClient(id);
      setShareUrl(link.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Partage impossible.");
    } finally {
      setSharing(false);
    }
  }

  async function remove() {
    if (!id) return;
    if (!window.confirm(`Retirer ${client?.name} du carnet ? Ses mesures et travaux restent enregistrés.`)) return;
    try {
      await TailorApi.deleteClient(id);
      router.replace("/tailleur/clients");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Suppression impossible.");
    }
  }

  if (!client) {
    return (
      <>
        <PageHeader title="Client" back />
        {error ? <ErrorBanner message={error} /> : <Spinner label="Chargement…" />}
      </>
    );
  }

  const latest = measurements?.[0] ?? null;
  const editee = new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="tPage">
      <PageHeader title={client.name} back />
      <ErrorBanner message={error} />

      <div className="tActionRow no-print">
        <a className="btn btnSecondary" href={`tel:${client.phone}`}>
          <IconPhone size={18} aria-hidden /> Appeler
        </a>
        <a
          className="btn btnSecondary"
          href={`https://wa.me/${waNumber(client.phone)}`}
          target="_blank"
          rel="noopener"
        >
          WhatsApp
        </a>
      </div>

      <Card>
        <p className="tRowSub" style={{ margin: 0 }}>
          {client.phone} · {client.gender === "male" ? "Homme" : "Femme"}
        </p>
        <label className="field" style={{ marginTop: 10 }}>
          <span className="fieldLabel">Notes</span>
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Préférences, acompte reçu au comptant…" />
        </label>
        <Button variant="secondary" onClick={saveNotes} disabled={savingNotes}>
          {savingNotes ? "Enregistrement…" : "Enregistrer les notes"}
        </Button>
      </Card>

      <section aria-labelledby="mesures-titre">
        <div className="tHeader no-print">
          <h2 id="mesures-titre" style={{ fontSize: 18, margin: 0, flex: 1 }}>Mesures</h2>
          <Link href={`/tailleur/mesurer?client=${client.id}`} className="btn btnSecondary">
            <IconMeasure size={18} aria-hidden /> Par photo
          </Link>
          <Button variant="ghost" onClick={() => setShowManual((s) => !s)}>
            Au mètre
          </Button>
        </div>
        {showManual && (
          <div className="card no-print" style={{ marginTop: 10 }}>
            <ManualMeasureForm onSubmit={saveManual} busy={savingManual} />
          </div>
        )}
        {!measurements ? (
          <Spinner label="Chargement…" />
        ) : measurements.length === 0 ? (
          <EmptyState
            icon={<IconMeasure size={26} strokeWidth={1.6} />}
            title="Aucune mesure"
            body="Mesurez ce client par photo ou au mètre ruban."
          />
        ) : (
          <ul className="tList" style={{ marginTop: 10 }}>
            {measurements.map((m, i) => (
              <li key={m.id} className="card">
                <strong>
                  Mesure n°{measurements.length - i}
                </strong>{" "}
                <span className="tRowSub">
                  · {m.height_cm} cm · {m.source === "manual" ? "au mètre" : "par photo"} · {formatDateFR(m.created_at)}
                </span>
                {i === 0 && (
                  <div className="tActionRow no-print" style={{ marginTop: 10 }}>
                    <Button variant="secondary" onClick={() => window.print()}>
                      <IconPrint size={18} aria-hidden /> Imprimer
                    </Button>
                    <Button variant="secondary" onClick={share} disabled={sharing}>
                      {sharing ? "…" : shareUrl ? "Lien copié ci-dessous" : "Partager"}
                    </Button>
                  </div>
                )}
                {i === 0 && shareUrl && (
                  <p className="no-print">
                    <a
                      href={`https://wa.me/?text=${encodeURIComponent(`Mes mesures Sur-MeZur : ${shareUrl}`)}`}
                      target="_blank"
                      rel="noopener"
                      className="authLink"
                    >
                      Envoyer par WhatsApp (lien public, expire)
                    </a>
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {latest && (
        <article className="fiche" aria-label="Fiche de mesures imprimable">
          <header className="ficheHeader">
            <div>
              <span className="ficheBrand">Sur-MeZur</span>
              <h2 className="ficheTitle">Fiche de mesures — {client.name}</h2>
            </div>
            <div className="ficheMeta">
              <div>Fiche éditée le {editee}</div>
              <div>Taille : {latest.height_cm} cm</div>
            </div>
          </header>
          {presentableGroups(latest.data).map((group) => (
            <section key={group.id}>
              <h3 className="measureGroupTitle">{group.title}</h3>
              <div className="measureList">
                {group.items.map(({ key, info, value }) => (
                  <div key={key} className="measureItem">
                    <div className="measureItemHead">
                      <span className="measureName">{info.label}</span>
                      <span className="measureValue">{formatCm(value)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
          <footer className="ficheFooter">
            Mesures obtenues à partir de deux photographies ou au mètre ruban. À vérifier avant la coupe si le vêtement est ajusté.
          </footer>
        </article>
      )}

      <section aria-labelledby="travaux-titre">
        <h2 id="travaux-titre" style={{ fontSize: 18 }}>Travaux de ce client</h2>
        {!jobs ? (
          <Spinner label="Chargement…" />
        ) : jobs.length === 0 ? (
          <p className="muted">Aucun travail enregistré.</p>
        ) : (
          <ul className="tList">
            {jobs.map((j) => (
              <li key={j.id} className="tRow">
                <span className="tRowMain">
                  <span className="tRowTitle">{j.description}</span>
                  <br />
                  <span className="tRowSub">
                    Échéance : {j.due_date ? `${formatDateFR(j.due_date)} (${dueLabel(j.due_date)})` : "—"}
                  </span>
                </span>
                <JobBadge status={j.status} />
              </li>
            ))}
          </ul>
        )}
        <p className="no-print">
          <Link href={`/tailleur/travaux?nouveau=1&client=${client.id}`} className="authLink">
            + Nouveau travail pour {client.name}
          </Link>
        </p>
      </section>

      <div className="no-print">
        <Button variant="ghost" onClick={remove}>
          Retirer du carnet
        </Button>
      </div>
    </div>
  );
}
