"use client";

/**
 * Accueil tailleur (B3.1) : l'essentiel d'un coup d'oeil, utilisable au
 * telephone en moins d'une minute. « A livrer cette semaine », « En retard »,
 * « Nouvelles commandes recues », et trois gros boutons : mesurer, nouveau
 * travail, patron a partir d'une photo. Les commandes recues sont accessibles
 * ici, avec un compteur.
 */

import { tr } from "@/lib/i18n";
import Link from "next/link";
import { useEffect, useState } from "react";
import { TailorApi } from "@/lib/api/tailor";
import type { TailorDashboard } from "@/lib/api/tailor";
import { PageHeader, Spinner } from "@/components/ui";
import { IconCamera, IconOrders, IconPlus, IconTailor, IconWallet } from "@/components/icons";
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

  if (dashboard === null) return <Spinner />;

  return (
    <div className="tPage">
      <PageHeader title={tr("Mon atelier", "My workshop")} />

      <div className="tStats" role="group" aria-label={tr("Suivi de la semaine", "This week")}>
        <Stat label={tr("À livrer cette semaine", "Due this week")} value={dashboard.due_this_week} href="/tailleur/travaux?filtre=semaine" />
        <Stat label={tr("En retard", "Late")} value={dashboard.late} alert={dashboard.late > 0} href="/tailleur/travaux?filtre=retard" />
        <Stat label={tr("Nouvelles commandes", "New orders")} value={newOrders ?? dashboard.new_orders} href="/tailleur/commandes" />
      </div>

      <div className="tBigButtons">
        <BigAction
          href="/tailleur/mesurer"
          icon={<IconCamera size={24} aria-hidden />}
          title={tr("Mesurer un client", "Measure a client")}
          sub={tr("Photo ou mètre", "Photo or tape")}
        />
        <BigAction
          href="/tailleur/travaux?nouveau=1"
          icon={<IconPlus size={24} aria-hidden />}
          title={tr("Nouveau travail", "New job")}
          secondary
        />
        <BigAction
          href="/tailleur/patrons/nouveau"
          icon={<IconTailor size={24} aria-hidden />}
          title={tr("Patron", "Pattern")}
          secondary
        />
      </div>

      <Link href="/tailleur/commandes" className="tRow">
        <IconOrders size={20} aria-hidden />
        <span className="tRowMain">
          <span className="tRowTitle">
            {tr("Commandes Sur-MeZur", "Sur-MeZur orders")}
            {(newOrders ?? dashboard.new_orders) > 0 && ` (${newOrders ?? dashboard.new_orders} ${tr("nouvelle(s)", "new")})`}
          </span>
        </span>
      </Link>

      <Link href="/tailleur/finances" className="tRow">
        <IconWallet size={20} aria-hidden />
        <span className="tRowMain">
          <span className="tRowTitle">{tr("Recettes de l'atelier", "Workshop income")}</span>
        </span>
      </Link>
    </div>
  );
}
