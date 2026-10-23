"use client";

/**
 * Profil d'un tailleur vu par un client : atelier, presentation, « Où le
 * trouver » (ville, quartier, repere, itineraire Google Maps), et contact.
 *
 * Contact, sur le modele de la fiche client du tailleur : Appeler (numero
 * copie au passage), WhatsApp avec un message qui dit que le contact vient
 * de Sur-MeZur, Enregistrer dans les contacts. Le numero n'est demande au
 * serveur que pour un compte connecte ; un visiteur est invite a se
 * connecter. Si le client a une commande en cours chez ce tailleur, le
 * message WhatsApp en donne la reference.
 */

import { tr } from "@/lib/i18n";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { OrdersApi, TailorsApi } from "@/lib/api/endpoints";
import type { Order, TailorContact, TailorProfile } from "@/lib/api/types";
import { useAuth } from "@/components/AuthProvider";
import { Badge, Button, Card, ErrorBanner, PageHeader, Spinner } from "@/components/ui";
import { IconCall, IconChat, IconContact, IconLocation, IconMeasure, IconReviews, IconRoute } from "@/components/icons";
import { copyText, openNewContact, whatsappHref } from "@/lib/contact";
import { hasPosition, tailorMapHref, tailorWhatsappMessage } from "@/lib/tailors";

function TailleurInner() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const modele = params.get("modele");
  const { user } = useAuth();
  const registered = Boolean(user && !user.is_guest);
  const [tailor, setTailor] = useState<TailorProfile | null>(null);
  const [contact, setContact] = useState<TailorContact | null>(null);
  const [lastOrder, setLastOrder] = useState<Order | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!id) return;
    TailorsApi.get(id)
      .then(setTailor)
      .catch((e) => setError(e instanceof Error ? e.message : tr("Tailleur introuvable.", "Tailor not found.")));
  }, [id]);

  useEffect(() => {
    if (!id || !registered) return;
    TailorsApi.contact(id)
      .then(setContact)
      .catch(() => setContact({ phone: null, whatsapp: false, hidden: true }));
    if (user?.role === "client") {
      OrdersApi.list()
        .then((list) => {
          const mine = list
            .filter((o) => o.tailor_id === id && o.status !== "cancelled")
            .sort((a, b) => b.created_at.localeCompare(a.created_at));
          setLastOrder(mine[0] ?? null);
        })
        .catch(() => setLastOrder(null));
    }
  }, [id, registered, user?.role]);

  if (!tailor) {
    return (
      <>
        <PageHeader title={tr("Tailleur", "Tailor")} back />
        <div className="container section">{error ? <ErrorBanner message={error} /> : <Spinner />}</div>
      </>
    );
  }

  const phone = contact?.phone ?? null;
  const map = tailorMapHref(tailor);
  const adresse = [tailor.city, tailor.quartier].filter((x) => x && x.trim()).join(", ");
  const commanderHref = `/tailleurs/${tailor.id}/commander${modele ? `?modele=${encodeURIComponent(modele)}` : ""}`;
  const here = `/tailleurs/${tailor.id}${modele ? `?modele=${encodeURIComponent(modele)}` : ""}`;
  const contactName = `${tailor.shop_name} (${tr("tailleur Sur-MeZur", "Sur-MeZur tailor")})`;

  async function copyPhone() {
    if (!phone) return;
    const copied = await copyText(phone);
    setNotice(copied ? tr(`Numéro ${phone} copié.`, `Number ${phone} copied.`) : "");
  }

  async function saveContact() {
    if (!phone) return;
    await copyPhone();
    openNewContact(contactName, phone);
  }

  return (
    <>
      <PageHeader title={tailor.shop_name} back />
      <div className="container section stack">
        <ErrorBanner message={error} />

        <div className="tailorHero">
          <span className="tailorThumb" aria-hidden>
            {tailor.atelier_photo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={tailor.atelier_photo_url} alt="" />
            ) : (
              tailor.shop_name.charAt(0).toUpperCase()
            )}
          </span>
          <div>
            <h2>{tailor.shop_name}</h2>
            <p className="tRowSub" style={{ margin: "4px 0 0" }}>
              {tr("Atelier de couture", "Tailoring workshop")}
              {tailor.rating_avg > 0 && (
                <>
                  {" · "}
                  <IconReviews size={13} aria-hidden /> {Number(tailor.rating_avg).toFixed(1).replace(".", ",")}
                </>
              )}
              {tailor.completed_orders_count > 0 && <> · {tailor.completed_orders_count} {tr("livrée(s)", "delivered")}</>}
            </p>
            {tailor.verification_enabled !== false && tailor.verification_status === "approved" && (
              <Badge tone="success">{tr("Vérifié", "Verified")}</Badge>
            )}
          </div>
        </div>

        {tailor.bio?.trim() && <p style={{ margin: 0, whiteSpace: "pre-line" }}>{tailor.bio}</p>}

        <Card>
          <h3 className="tailorBlockTitle">{tr("Où le trouver", "Where to find them")}</h3>
          {adresse || tailor.landmark ? (
            <p className="tailorAddress">
              <IconLocation size={15} aria-hidden /> {adresse || tr("Adresse non précisée", "No address given")}
              {tailor.landmark?.trim() && (
                <>
                  <br />
                  <span className="tRowSub">{tr("Repère", "Landmark")} : {tailor.landmark}</span>
                </>
              )}
            </p>
          ) : (
            <p className="muted" style={{ marginTop: 0 }}>{tr("Adresse non renseignée.", "No address yet.")}</p>
          )}
          {map && (
            <a className="btn btnSecondary" href={map} target="_blank" rel="noopener noreferrer">
              <IconRoute size={18} aria-hidden /> {hasPosition(tailor) ? tr("Itinéraire", "Directions") : tr("Voir sur la carte", "View on map")}
            </a>
          )}
        </Card>

        <Card>
          <h3 className="tailorBlockTitle">{tr("Contacter", "Contact")}</h3>
          {!registered ? (
            <div className="banner bannerInfo" style={{ display: "block" }}>
              {tr("Connectez-vous pour contacter ce tailleur.", "Sign in to contact this tailor.")}{" "}
              <Link href={`/connexion?suite=${encodeURIComponent(here)}`} className="linkButton">
                {tr("Se connecter", "Sign in")}
              </Link>
            </div>
          ) : contact === null ? (
            <Spinner />
          ) : phone ? (
            <>
              <div className="tActionRow">
                <a className="btn btnSecondary" href={`tel:${phone.replace(/[^\d+]/g, "")}`} onClick={() => void copyPhone()}>
                  <IconCall size={18} aria-hidden /> {tr("Appeler", "Call")}
                </a>
                <a className="btn btnWhatsapp" href={whatsappHref(phone, tailorWhatsappMessage(tailor.shop_name, lastOrder?.id))}>
                  <IconChat size={18} aria-hidden /> WhatsApp
                </a>
                <button type="button" className="btn btnSecondary" onClick={() => void saveContact()}>
                  <IconContact size={18} aria-hidden /> {tr("Enregistrer le contact", "Save contact")}
                </button>
              </div>
              {notice && <p className="tNotice" role="status">{notice}</p>}
            </>
          ) : (
            <p className="muted" style={{ margin: 0 }}>
              {tr("Contact par commande Sur-MeZur uniquement.", "Contact through a Sur-MeZur order only.")}
            </p>
          )}
        </Card>

        {(!registered || user?.role === "client") && (
          <div className="actionBar">
            <Link href={registered ? commanderHref : `/connexion?suite=${encodeURIComponent(commanderHref)}`} style={{ display: "contents" }}>
              <Button block>
                <IconMeasure size={18} aria-hidden /> {tr("Envoyer mes mesures", "Send my measurements")}
              </Button>
            </Link>
          </div>
        )}
      </div>
    </>
  );
}

export default function TailleurProfil() {
  return (
    <Suspense fallback={<Spinner />}>
      <TailleurInner />
    </Suspense>
  );
}
