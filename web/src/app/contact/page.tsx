"use client";

/**
 * Contact (B2.6, 12.1) : formulaire ouvert aux visiteurs comme aux comptes.
 *
 * Nom + telephone ou e-mail quand on n'est pas connecte (preremplis sinon),
 * categorie, objet, message → `POST /api/support/tickets`, puis confirmation
 * avec le numero de la demande.
 */

import { tr } from "@/lib/i18n";
import Link from "next/link";
import { useState } from "react";
import { PublicApi } from "@/lib/api/endpoints";
import { useAuth } from "@/components/AuthProvider";
import { PhoneField } from "@/components/fields";
import { Button, ErrorBanner, InfoBanner } from "@/components/ui";
import { COUNTRIES, splitPhone } from "@/lib/countries";
import { emailError, phoneError } from "@/lib/validation";

const CATEGORIES = [
  { code: "question", fr: "Question", en: "Question" },
  { code: "probleme", fr: "Problème avec le site", en: "Problem with the site" },
  { code: "mesures", fr: "Mesures ou photos", en: "Measurements or photos" },
  { code: "compte", fr: "Mon compte", en: "My account" },
  { code: "suggestion", fr: "Suggestion", en: "Suggestion" },
  { code: "autre", fr: "Autre", en: "Other" },
];

export default function Contact() {
  const { user } = useAuth();
  const [name, setName] = useState(user?.full_name ?? "");
  const [phone, setPhone] = useState(COUNTRIES[0].dial);
  const [email, setEmail] = useState(user?.email ?? "");
  const [category, setCategory] = useState("question");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [ticketNumber, setTicketNumber] = useState<number | null>(null);

  // Un visiteur doit laisser un moyen de lui repondre : numero ou e-mail
  // valide (lib/validation).
  const hasPhone = splitPhone(phone).local !== "";
  const phoneErr = hasPhone ? phoneError(phone) : null;
  const emailErr = emailError(email);
  const reachable = Boolean(user) || (hasPhone && !phoneErr) || (email.trim() !== "" && !emailErr);
  const canSubmit =
    subject.trim().length >= 3 && message.trim().length >= 10 && !phoneErr && !emailErr && reachable && !busy;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await PublicApi.contact({
        ...(name.trim() ? { name: name.trim() } : {}),
        ...(hasPhone && !phoneErr ? { phone: phone.trim() } : {}),
        ...(email.trim() ? { email: email.trim() } : {}),
        category,
        subject: subject.trim(),
        body: message.trim(),
      });
      setTicketNumber(res.number);
    } catch (err) {
      setError(err instanceof Error ? err.message : tr("Envoi impossible. Réessayez.", "Could not send. Try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="containerNarrow section">
      <h1>{tr("Contact", "Contact")}</h1>
      <ErrorBanner message={error} />
      {ticketNumber !== null ? (
        <>
          <InfoBanner>
            <span>
              {tr("Message envoyé. Demande", "Message sent. Request")} <strong>n° {ticketNumber}</strong>.
            </span>
          </InfoBanner>
          <p>
            <Link href="/" className="authLink">{tr("Retour à l'accueil", "Back to home")}</Link>
          </p>
        </>
      ) : (
        <form onSubmit={submit} noValidate>
          <label className="field">
            <span className="fieldLabel">{tr("Votre nom", "Your name")}</span>
            <input className="input" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
          </label>
          {!user && (
            <>
              <PhoneField label={tr("Téléphone", "Phone")} value={phone} onChange={setPhone} error={phoneErr} />
              <label className="field">
                <span className="fieldLabel">E-mail <span className="fieldOptional">{tr("(si pas de téléphone)", "(if no phone)")}</span></span>
                <input
                  className="input"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  maxLength={160}
                  aria-invalid={emailErr ? true : undefined}
                />
                {emailErr && <span className="fieldError">{emailErr}</span>}
              </label>
              {!reachable && !phoneErr && !emailErr && (
                <p className="fieldHint" style={{ marginTop: -8 }}>
                  {tr("Un numéro ou un e-mail pour la réponse.", "A phone or e-mail for the reply.")}
                </p>
              )}
            </>
          )}
          <label className="field">
            <span className="fieldLabel">{tr("Catégorie", "Category")}</span>
            <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES.map((c) => (
                <option key={c.code} value={c.code}>{tr(c.fr, c.en)}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="fieldLabel">{tr("Objet", "Subject")}</span>
            <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={120} />
          </label>
          <label className="field">
            <span className="fieldLabel">{tr("Message", "Message")}</span>
            <textarea
              className="input"
              rows={5}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={2000}
            />
          </label>
          <Button type="submit" block disabled={!canSubmit}>
            {busy ? tr("Envoi…", "Sending…") : tr("Envoyer", "Send")}
          </Button>
        </form>
      )}
    </main>
  );
}
