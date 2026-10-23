"use client";

/**
 * Fiche d'un client du carnet (B3.2) : appeler, WhatsApp, enregistrer dans
 * les contacts du telephone (numero copie au passage dans les deux premiers
 * cas, pour le coller si le telephone ne le remplit pas), nom, numero et sexe
 * modifiables, notes, historique
 * des mesures et des travaux, nouvelle mesure (photo ou metre), fiche
 * imprimable et partageable par WhatsApp (lien public en lecture seule,
 * qui expire).
 */

import { locale, tr } from "@/lib/i18n";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { TailorApi } from "@/lib/api/tailor";
import type { ClientMeasurement, TailorClient, TailorJob } from "@/lib/api/tailor";
import { formatCm, presentableGroups } from "@/lib/measurements";
import { Button, Card, EmptyState, ErrorBanner, Input, PageHeader, Spinner, Textarea } from "@/components/ui";
import { PhoneField } from "@/components/fields";
import { IconCall, IconChat, IconContact, IconEdit, IconMeasure, IconPrint } from "@/components/icons";
import { copyText, openNewContact, whatsappHref } from "@/lib/contact";
import { COUNTRIES, splitPhone } from "@/lib/countries";
import { nameError, phoneError } from "@/lib/validation";
import { JobBadge, ManualMeasureForm, dueLabel, formatDateFR } from "../../_components";

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
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editGender, setEditGender] = useState("female");
  const [savingEdit, setSavingEdit] = useState(false);

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
      setError(e instanceof Error ? e.message : tr("Chargement impossible.", "Could not load."));
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
      setError(e instanceof Error ? e.message : tr("Enregistrement impossible.", "Could not save."));
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
      setError(e instanceof Error ? e.message : tr("Enregistrement impossible.", "Could not save."));
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
      setError(e instanceof Error ? e.message : tr("Partage impossible.", "Could not share."));
    } finally {
      setSharing(false);
    }
  }

  function startEdit() {
    if (!client) return;
    setEditName(client.name);
    setEditPhone(client.phone || COUNTRIES[0].dial);
    setEditGender(client.gender === "male" ? "male" : "female");
    setEditing(true);
  }

  const editNameErr = editName.trim() ? nameError(editName) : null;
  const editPhoneErr = splitPhone(editPhone).local ? phoneError(editPhone) : null;
  const canSaveEdit = !nameError(editName) && !phoneError(editPhone) && !savingEdit;

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!id || !canSaveEdit) return;
    setSavingEdit(true);
    setError("");
    try {
      setClient(await TailorApi.patchClient(id, { name: editName.trim(), phone: editPhone, gender: editGender }));
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : tr("Enregistrement impossible.", "Could not save."));
    } finally {
      setSavingEdit(false);
    }
  }

  /** Copie le numero : le composeur ou les contacts le recoivent deja, mais
   *  certains telephones l'ignorent ; il suffit alors de le coller. */
  async function copyPhone() {
    if (!client?.phone) return;
    const copied = await copyText(client.phone);
    setNotice(copied ? tr(`Numéro ${client.phone} copié.`, `Number ${client.phone} copied.`) : "");
  }

  async function saveContact() {
    if (!client?.phone) return;
    await copyPhone();
    openNewContact(client.name, client.phone);
  }

  async function remove() {
    if (!id) return;
    if (!window.confirm(tr(`Retirer ${client?.name} du carnet ?`, `Remove ${client?.name} from your clients?`))) return;
    try {
      await TailorApi.deleteClient(id);
      router.replace("/tailleur/clients");
    } catch (e) {
      setError(e instanceof Error ? e.message : tr("Suppression impossible.", "Could not delete."));
    }
  }

  if (!client) {
    return (
      <>
        <PageHeader title={tr("Client", "Client")} back />
        {error ? <ErrorBanner message={error} /> : <Spinner />}
      </>
    );
  }

  const latest = measurements?.[0] ?? null;
  const telHref = `tel:${client.phone.replace(/[^\d+]/g, "")}`;
  const editee = new Date().toLocaleDateString(locale(), { day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="tPage">
      <PageHeader title={client.name} back />
      <ErrorBanner message={error} />

      {client.phone ? (
        <div className="tActionRow no-print">
          <a className="btn btnSecondary" href={telHref} onClick={() => void copyPhone()}>
            <IconCall size={18} aria-hidden /> {tr("Appeler", "Call")}
          </a>
          <a className="btn btnWhatsapp" href={whatsappHref(client.phone)}>
            <IconChat size={18} aria-hidden /> WhatsApp
          </a>
          <button type="button" className="btn btnSecondary" onClick={() => void saveContact()}>
            <IconContact size={18} aria-hidden /> {tr("Enregistrer le contact", "Save contact")}
          </button>
        </div>
      ) : (
        <div className="banner bannerInfo no-print" style={{ display: "block" }}>
          {tr("Aucun numéro.", "No phone number.")}{" "}
          <button type="button" className="linkButton" onClick={startEdit}>
            {tr("Ajouter le numéro", "Add number")}
          </button>
        </div>
      )}
      {notice && <p className="tNotice no-print" role="status">{notice}</p>}

      {editing && (
        <form className="card no-print" onSubmit={saveEdit} noValidate>
          <label className="field">
            <span className="fieldLabel">{tr("Nom", "Name")}</span>
            <Input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              maxLength={120}
              aria-invalid={editNameErr ? true : undefined}
            />
            {editNameErr && <span className="fieldError">{editNameErr}</span>}
          </label>
          <PhoneField label={tr("Téléphone", "Phone")} value={editPhone} onChange={setEditPhone} error={editPhoneErr} />
          <label className="field">
            <span className="fieldLabel">{tr("Sexe", "Sex")}</span>
            <select className="input" value={editGender} onChange={(e) => setEditGender(e.target.value)}>
              <option value="female">{tr("Femme", "Female")}</option>
              <option value="male">{tr("Homme", "Male")}</option>
            </select>
          </label>
          <div className="tActionRow">
            <Button type="submit" disabled={!canSaveEdit}>
              {savingEdit ? tr("Enregistrement…", "Saving…") : tr("Enregistrer", "Save")}
            </Button>
            <Button variant="ghost" onClick={() => setEditing(false)}>
              {tr("Annuler", "Cancel")}
            </Button>
          </div>
        </form>
      )}

      <Card>
        <div className="tHeader">
          <p className="tRowSub" style={{ margin: 0, flex: 1 }}>
            {client.phone || tr("Aucun numéro", "No number")} · {client.gender === "male" ? tr("Homme", "Male") : tr("Femme", "Female")}
          </p>
          {!editing && (
            <Button variant="ghost" className="no-print" onClick={startEdit}>
              <IconEdit size={16} aria-hidden /> {tr("Modifier", "Edit")}
            </Button>
          )}
        </div>
        <label className="field" style={{ marginTop: 10 }}>
          <span className="fieldLabel">{tr("Notes", "Notes")}</span>
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={tr("Préférences…", "Preferences…")} />
        </label>
        <Button variant="secondary" onClick={saveNotes} disabled={savingNotes}>
          {savingNotes ? tr("Enregistrement…", "Saving…") : tr("Enregistrer les notes", "Save notes")}
        </Button>
      </Card>

      <section aria-labelledby="mesures-titre">
        <div className="tHeader no-print">
          <h2 id="mesures-titre" style={{ fontSize: 18, margin: 0, flex: 1 }}>{tr("Mesures", "Measurements")}</h2>
          <Link href={`/tailleur/mesurer?client=${client.id}`} className="btn btnSecondary">
            <IconMeasure size={18} aria-hidden /> {tr("Par photo", "By photo")}
          </Link>
          <Button variant="ghost" onClick={() => setShowManual((s) => !s)}>
            {tr("Au mètre", "With tape")}
          </Button>
        </div>
        {showManual && (
          <div className="card no-print" style={{ marginTop: 10 }}>
            <ManualMeasureForm onSubmit={saveManual} busy={savingManual} />
          </div>
        )}
        {!measurements ? (
          <Spinner />
        ) : measurements.length === 0 ? (
          <EmptyState
            icon={<IconMeasure size={26} strokeWidth={1.6} />}
            title={tr("Aucune mesure", "No measurements")}
          />
        ) : (
          <ul className="tList" style={{ marginTop: 10 }}>
            {measurements.map((m, i) => (
              <li key={m.id} className="card">
                <strong>
                  {tr("Mesure n°", "Measurement #")}{measurements.length - i}
                </strong>{" "}
                <span className="tRowSub">
                  · {m.height_cm} cm · {m.source === "manual" ? tr("au mètre", "tape") : tr("par photo", "photo")} · {formatDateFR(m.created_at)}
                </span>
                {i === 0 && (
                  <div className="tActionRow no-print" style={{ marginTop: 10 }}>
                    <Button variant="secondary" onClick={() => window.print()}>
                      <IconPrint size={18} aria-hidden /> {tr("Imprimer", "Print")}
                    </Button>
                    <Button variant="secondary" onClick={share} disabled={sharing}>
                      {sharing ? "…" : shareUrl ? tr("Lien prêt", "Link ready") : tr("Partager", "Share")}
                    </Button>
                  </div>
                )}
                {i === 0 && shareUrl && (
                  <p className="no-print">
                    <a href={whatsappHref(client.phone, tr(`Vos mesures Sur-MeZur : ${shareUrl}`, `Your Sur-MeZur measurements: ${shareUrl}`))} className="authLink">
                      {tr(`Envoyer à ${client.name} par WhatsApp`, `Send to ${client.name} on WhatsApp`)}
                    </a>
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {latest && (
        <article className="fiche" aria-label={tr("Fiche de mesures", "Measurement sheet")}>
          <header className="ficheHeader">
            <div>
              <span className="ficheBrand">Sur-MeZur</span>
              <h2 className="ficheTitle">{tr("Fiche de mesures", "Measurement sheet")} — {client.name}</h2>
            </div>
            <div className="ficheMeta">
              <div>{tr(`Éditée le ${editee}`, `Issued ${editee}`)}</div>
              <div>{tr("Taille", "Height")} : {latest.height_cm} cm</div>
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
            {tr("À vérifier au mètre avant de couper un vêtement ajusté.", "Check with a tape before cutting a fitted garment.")}
          </footer>
        </article>
      )}

      <section aria-labelledby="travaux-titre">
        <h2 id="travaux-titre" style={{ fontSize: 18 }}>{tr("Travaux", "Jobs")}</h2>
        {!jobs ? (
          <Spinner />
        ) : jobs.length === 0 ? (
          <p className="muted">{tr("Aucun travail.", "No jobs.")}</p>
        ) : (
          <ul className="tList">
            {jobs.map((j) => (
              <li key={j.id} className="tRow">
                <span className="tRowMain">
                  <span className="tRowTitle">{j.description}</span>
                  <br />
                  <span className="tRowSub">
                    {tr("Échéance", "Due")} : {j.due_date ? `${formatDateFR(j.due_date)} (${dueLabel(j.due_date)})` : "—"}
                  </span>
                </span>
                <JobBadge status={j.status} />
              </li>
            ))}
          </ul>
        )}
        <p className="no-print">
          <Link href={`/tailleur/travaux?nouveau=1&client=${client.id}`} className="authLink">
            {tr("+ Nouveau travail", "+ New job")}
          </Link>
        </p>
      </section>

      <div className="no-print">
        <Button variant="ghost" onClick={remove}>
          {tr("Retirer du carnet", "Remove client")}
        </Button>
      </div>
    </div>
  );
}
