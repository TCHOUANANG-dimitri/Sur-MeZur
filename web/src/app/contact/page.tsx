"use client";

/**
 * Contact (B2.6, 12.1) : formulaire ouvert aux visiteurs comme aux comptes.
 *
 * Nom + telephone ou e-mail quand on n'est pas connecte (preremplis sinon),
 * categorie, objet, message → `POST /api/support/tickets`, puis confirmation
 * avec le numero de la demande.
 */

import Link from "next/link";
import { useState } from "react";
import { PublicApi } from "@/lib/api/endpoints";
import { useAuth } from "@/components/AuthProvider";
import { PhoneField } from "@/components/fields";
import { Button, ErrorBanner, InfoBanner } from "@/components/ui";
import { COUNTRIES } from "@/lib/countries";

const CATEGORIES = [
  { code: "question", name: "Question" },
  { code: "probleme", name: "Problème avec le site" },
  { code: "mesures", name: "Mesures ou photos" },
  { code: "compte", name: "Mon compte" },
  { code: "suggestion", name: "Suggestion" },
  { code: "autre", name: "Autre" },
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

  const canSubmit =
    subject.trim().length >= 3 && message.trim().length >= 10 && !busy;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await PublicApi.contact({
        ...(name.trim() ? { name: name.trim() } : {}),
        ...(phone.replace(/[^0-9]/g, "").length >= 6 ? { phone: phone.trim() } : {}),
        ...(email.trim() ? { email: email.trim() } : {}),
        category,
        subject: subject.trim(),
        body: message.trim(),
      });
      setTicketNumber(res.number);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Envoi impossible. Réessayez.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="containerNarrow section">
      <h1>Contact</h1>
      <p className="muted">Une question, un problème ? Écrivez-nous, on vous répond.</p>
      <ErrorBanner message={error} />
      {ticketNumber !== null ? (
        <>
          <InfoBanner>
            <span>
              Message envoyé. Votre demande porte le <strong>n° {ticketNumber}</strong> :
              gardez-le pour le suivi.
            </span>
          </InfoBanner>
          <p>
            <Link href="/" className="authLink">Retour à l&apos;accueil</Link>
          </p>
        </>
      ) : (
        <form onSubmit={submit} noValidate>
          <label className="field">
            <span className="fieldLabel">Votre nom</span>
            <input className="input" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          {!user && (
            <>
              <PhoneField label="Téléphone" value={phone} onChange={setPhone} />
              <label className="field">
                <span className="fieldLabel">E-mail <span className="fieldOptional">(si pas de téléphone)</span></span>
                <input
                  className="input"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
            </>
          )}
          <label className="field">
            <span className="fieldLabel">Catégorie</span>
            <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES.map((c) => (
                <option key={c.code} value={c.code}>{c.name}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="fieldLabel">Objet</span>
            <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={120} />
          </label>
          <label className="field">
            <span className="fieldLabel">Message</span>
            <textarea
              className="input"
              rows={5}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={2000}
            />
          </label>
          <Button type="submit" block disabled={!canSubmit}>
            {busy ? "Envoi…" : "Envoyer"}
          </Button>
        </form>
      )}
    </main>
  );
}
