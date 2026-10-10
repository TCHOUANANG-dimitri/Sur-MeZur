"use client";

/**
 * Accueil tailleur (B3.1) : l'essentiel d'un coup d'oeil, utilisable au
 * telephone en moins d'une minute. « A livrer cette semaine », « En retard »,
 * « Nouvelles commandes recues », et trois gros boutons : mesurer, nouveau
 * travail, patron a partir d'une photo. Les commandes recues sont accessibles
 * ici, avec un compteur.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { TailorApi } from "@/lib/api/tailor";
import type { TailorDashboard } from "@/lib/api/tailor";
import { PageHeader, Spinner } from "@/components/ui";
import { IconCamera, IconOrders, IconPlus, IconTailor } from "@/components/icons";
import { BigAction, Stat } from "./_components";

export default function TailleurAccueil() {
  const [dashboard, setDashboard] = useState<TailorDashboard | null>(null);
  const [newOrders, setNewOrders] = useState<number | null>(null);

  useEffect(() => {
    TailorApi.dashboard().then(setDashboard).catch(() => setDashboard(null));
    TailorApi.orders()
      .then((list) => setNewOrders(list.filter((o) => o.status === "new").length))
      .catch(() => setNewOrders(0));
  }, []);

  if (dashboard === null) return <Spinner label="Chargement…" />;

  return (
    <div className="tPage">
      <PageHeader title="Mon atelier" />

      <div className="tStats" role="group" aria-label="Suivi de la semaine">
        <Stat label="À livrer cette semaine" value={dashboard.due_this_week} href="/tailleur/travaux?filtre=semaine" />
        <Stat label="En retard" value={dashboard.late} alert={dashboard.late > 0} href="/tailleur/travaux?filtre=retard" />
        <Stat label="Nouvelles commandes" value={newOrders ?? dashboard.new_orders} href="/tailleur/commandes" />
      </div>

      <div className="tBigButtons">
        <BigAction
          href="/tailleur/mesurer"
          icon={<IconCamera size={24} aria-hidden />}
          title="Mesurer un client"
          sub="Par photo ou au mètre"
        />
        <BigAction
          href="/tailleur/travaux?nouveau=1"
          icon={<IconPlus size={24} aria-hidden />}
          title="Nouveau travail"
          sub="Commande directe"
        />
        <BigAction
          href="/tailleur/patrons/nouveau"
          icon={<IconTailor size={24} aria-hidden />}
          title="Patron sur photo"
          sub="Version d'aperçu"
        />
      </div>

      {(newOrders ?? dashboard.new_orders) > 0 && (
        <Link href="/tailleur/commandes" className="tRow" aria-label="Voir les commandes reçues">
          <span className="tRowMain">
            <span className="tRowTitle">
              <IconOrders size={18} aria-hidden /> Commandes reçues via Sur-MeZur ({newOrders ?? dashboard.new_orders} nouvelle{(newOrders ?? dashboard.new_orders) > 1 ? "s" : ""})
            </span>
            <br />
            <span className="tRowSub">Accepter, suivre, discuter avec le client.</span>
          </span>
        </Link>
      )}
    </div>
  );
}
