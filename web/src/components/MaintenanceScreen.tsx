"use client";

/**
 * Ecran de maintenance (B1.5).
 *
 * Monte dans `app/layout.tsx`. Lit une fois `GET /api/public/config` : si
 * `maintenance.enabled`, ecran plein ecran avec le message du serveur. Le
 * client d'API emet aussi `smz:maintenance` quand une route publique repond
 * 503 : on l'ecoute pour basculer sans recharger.
 *
 * Si le backend est injoignable, on n'affiche rien : le site reste utilisable
 * (la prise de mesure creera l'erreur explicite elle-meme le cas echeant).
 */

import { useEffect, useState } from "react";
import { PublicApi } from "@/lib/api/endpoints";

const MESSAGE_DEFAUT = "Le site est en maintenance. Revenez dans un moment.";

export function MaintenanceScreen() {
  const [maintenance, setMaintenance] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    PublicApi.config()
      .then((config) => {
        if (alive && config.maintenance?.enabled) setMaintenance(config.maintenance.message || MESSAGE_DEFAUT);
      })
      .catch(() => {
        /* backend injoignable : le site reste utilisable */
      });
    const onMaintenance = (e: Event) => setMaintenance((e as CustomEvent<string>).detail || MESSAGE_DEFAUT);
    window.addEventListener("smz:maintenance", onMaintenance);
    return () => {
      alive = false;
      window.removeEventListener("smz:maintenance", onMaintenance);
    };
  }, []);

  if (!maintenance) return null;
  return (
    <div className="maintenanceScreen" role="alert">
      <div className="maintenanceCard">
        <h1>Sur-MeZur fait une pause</h1>
        <p>{maintenance}</p>
        <button type="button" className="btn btnPrimary" onClick={() => window.location.reload()}>
          Réessayer
        </button>
      </div>
    </div>
  );
}
