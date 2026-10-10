"use client";

/**
 * Bandeau du site + ecran de maintenance (B1.5).
 *
 * Monte dans `app/layout.tsx`. Lit une fois `GET /api/public/config` :
 * - `banner` (tons info, alerte, promo ; lien facultatif) : bandeau fin en
 *   haut du site, refermable par la personne (choix memorise par message) ;
 * - `maintenance.enabled` : ecran de maintenance plein ecran avec le message
 *   du serveur. Le client d'API emet aussi `smz:maintenance` quand une route
 *   publique repond 503 : on l'ecoute pour basculer sans recharger.
 *
 * Si le backend est injoignable, on n'affiche rien : le site reste utilisable
 * (la prise de mesure creera l'erreur explicite elle-meme le cas echeant).
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { PublicApi } from "@/lib/api/endpoints";
import { IconClose, IconInfo } from "./icons";

type Tone = "info" | "alerte" | "promo";

interface BannerState {
  message: string;
  tone: Tone;
  link_url?: string;
  link_label?: string;
}

function normalizeTone(tone: string | undefined): Tone {
  if (tone === "alerte" || tone === "warning" || tone === "alert") return "alerte";
  if (tone === "promo" || tone === "success") return "promo";
  return "info";
}

function dismissKey(message: string): string {
  let hash = 0;
  for (let i = 0; i < message.length; i++) hash = (hash * 31 + message.charCodeAt(i)) | 0;
  return `smz_banner_dismissed_${hash}`;
}

export function SiteBanner() {
  const [banner, setBanner] = useState<BannerState | null>(null);
  const [maintenance, setMaintenance] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    PublicApi.config()
      .then((config) => {
        if (!alive) return;
        if (config.maintenance?.enabled) {
          setMaintenance(config.maintenance.message || "Le site est en maintenance. Revenez dans un moment.");
          return;
        }
        const b = config.banner;
        if (b?.enabled && b.message) {
          try {
            if (localStorage.getItem(dismissKey(b.message))) return;
          } catch {
            /* stockage indisponible : on affiche quand meme */
          }
          if (alive) {
            setBanner({
              message: b.message,
              tone: normalizeTone(b.tone),
              link_url: b.link_url || undefined,
              link_label: b.link_label || undefined,
            });
          }
        }
      })
      .catch(() => {
        /* backend injoignable : pas de bandeau, le site reste utilisable */
      });
    const onMaintenance = (e: Event) => {
      const message = (e as CustomEvent<string>).detail || "Le site est en maintenance. Revenez dans un moment.";
      setMaintenance(message);
    };
    window.addEventListener("smz:maintenance", onMaintenance);
    return () => {
      alive = false;
      window.removeEventListener("smz:maintenance", onMaintenance);
    };
  }, []);

  function dismiss() {
    if (banner) {
      try {
        localStorage.setItem(dismissKey(banner.message), "1");
      } catch {
        /* ignore */
      }
      setBanner(null);
    }
  }

  return (
    <>
      {banner && (
        <div className={`siteBanner siteBanner${banner.tone === "info" ? "Info" : banner.tone === "alerte" ? "Alerte" : "Promo"}`} role="status">
          <IconInfo size={18} aria-hidden />
          <p>
            {banner.message}{" "}
            {banner.link_url && (
              banner.link_url.startsWith("/") ? (
                <Link href={banner.link_url} className="siteBannerLink">
                  {banner.link_label || "En savoir plus"}
                </Link>
              ) : (
                <a href={banner.link_url} className="siteBannerLink" rel="noopener">
                  {banner.link_label || "En savoir plus"}
                </a>
              )
            )}
          </p>
          <button type="button" className="siteBannerClose" onClick={dismiss} aria-label="Fermer le bandeau">
            <IconClose size={18} aria-hidden />
          </button>
        </div>
      )}
      {maintenance && (
        <div className="maintenanceScreen" role="alert">
          <div className="maintenanceCard">
            <h1>Sur-MeZur fait une pause</h1>
            <p>{maintenance}</p>
            <button type="button" className="btn btnPrimary" onClick={() => window.location.reload()}>
              Réessayer
            </button>
          </div>
        </div>
      )}
    </>
  );
}
