"use client";

/**
 * Accueil, calque sur l'ecran mobile (mobile/app/client/(tabs)/home.tsx) :
 * salutation surmontee de la marque, barre de recherche, puis un rail
 * horizontal par section — les plus aimes d'abord, ensuite une section par
 * categorie.
 *
 * Deux blocs du mobile sont absents, faute d'equivalent sur le web :
 *  - la cloche de notifications, qui n'a pas d'ecran de destination ici ;
 *  - « Tailleurs pres de chez vous », la version web n'ayant pas de fiche
 *    tailleur — un lien y menerait vers une page inexistante.
 * A la place, un rappel de prise de mesure : c'est la raison d'etre de cette
 * version.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { CatalogApi, MeasurementsApi, OrdersApi } from "@/lib/api/endpoints";
import type { Category, GarmentModel, Measurement } from "@/lib/api/types";
import { useAuth } from "@/components/AuthProvider";
import { ModelCard } from "@/components/ModelCard";
import { getSelection, onSelectionChange } from "@/lib/selection";
import { Button, Spinner } from "@/components/ui";
import { IconChevronRight, IconOrders, IconSearch } from "@/components/icons";
import { tr } from "@/lib/i18n";

export default function Accueil() {
  const { user } = useAuth();
  const [popular, setPopular] = useState<GarmentModel[] | null>(null);
  const [saved, setSaved] = useState<GarmentModel[] | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [byCategory, setByCategory] = useState<Record<string, GarmentModel[]>>({});
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [selection, setSelection] = useState<string[]>([]);
  // Commandes chez un tailleur qui ne sont ni livrees ni annulees.
  const [openOrders, setOpenOrders] = useState(0);

  useEffect(() => {
    CatalogApi.models({ sort: "popular", limit: 10 })
      .then(setPopular)
      .catch(() => setPopular([]));

    CatalogApi.models({ liked_only: true, limit: 10 })
      .then(setSaved)
      .catch(() => setSaved([]));

    CatalogApi.categories()
      .then((cats) => {
        setCategories(cats);
        cats.forEach((cat) => {
          CatalogApi.models({ category_id: cat.id, limit: 10 })
            .then((list) => setByCategory((prev) => ({ ...prev, [cat.id]: list })))
            .catch(() => {});
        });
      })
      .catch(() => setCategories([]));

    MeasurementsApi.list()
      .then(setMeasurements)
      .catch(() => setMeasurements([]));

    OrdersApi.list()
      .then((list) => setOpenOrders(list.filter((o) => ["new", "in_progress", "ready_for_pickup"].includes(o.status)).length))
      .catch(() => setOpenOrders(0));
  }, []);

  useEffect(() => {
    const sync = () => setSelection(getSelection());
    sync();
    return onSelectionChange(sync);
  }, []);

  const firstName = user?.full_name?.split(" ")[0];
  const latest = measurements[0];

  return (
    <div className="home">
      <div className="homeTopRow">
        <div>
          <p className="homeHello">{tr("Bonjour", "Hello")}{firstName ? `, ${firstName}` : ""}</p>
          <p className="homeBrand">Sur-MeZur</p>
        </div>
      </div>

      <Link href="/modeles" className="homeSearchBar">
        <IconSearch size={16} aria-hidden />
        <span>{tr("Rechercher un modèle", "Search styles")}</span>
      </Link>

      {/* Rappel de mesure : la raison d'etre de cette version web. */}
      <section className="homeMeasureCta">
        <div>
          <h2>{latest ? tr("Vos mesures sont prêtes", "Your measurements are ready") : tr("Prenez vos mesures", "Take your measurements")}</h2>
          <p>{latest ? tr("À remettre au tailleur.", "Ready for your tailor.") : tr("Deux photos suffisent.", "Two photos are enough.")}</p>
        </div>
        <Link
          href={latest ? `/mesures/${latest.id}` : "/mesures/nouvelle"}
          style={{ display: "contents" }}
        >
          <Button block>{latest ? tr("Voir mes mesures", "View my measurements") : tr("Commencer", "Start")}</Button>
        </Link>
      </section>

      {openOrders > 0 && (
        <Link href="/commandes" className="tRow">
          <IconOrders size={20} aria-hidden />
          <span className="tRowMain">
            <span className="tRowTitle">
              {tr(`Mes commandes (${openOrders} en cours)`, `My orders (${openOrders} in progress)`)}
            </span>
          </span>
          <IconChevronRight size={18} aria-hidden />
        </Link>
      )}

      {/* Les mesures ont une suite : les envoyer a un tailleur. */}
      <section className="homeContribute">
        <div>
          <h2>{tr("Faire coudre par un tailleur", "Have it made by a tailor")}</h2>
        </div>
        <Link href="/tailleurs" style={{ display: "contents" }}>
          <Button variant="secondary">{tr("Voir les tailleurs", "See tailors")}</Button>
        </Link>
      </section>

      {/* Les modeles enregistres (coeur) d'abord : c'est ce que la personne
          a deja choisi, il doit etre a portee de main. */}
      <ModelSection title={tr("Mes modèles enregistrés", "My saved styles")} models={saved} href="/modeles?favoris=1" selection={selection} />

      <ModelSection title={tr("Les plus aimés", "Most liked")} models={popular} href="/modeles?tri=populaire" selection={selection} />

      {categories.map((cat) => (
        <ModelSection
          key={cat.id}
          title={cat.name}
          models={byCategory[cat.id] ?? null}
          href={`/modeles?categorie=${cat.id}`}
          selection={selection}
        />
      ))}

      <section className="homeContribute">
        <div>
          <h2>{tr("Un modèle à partager ?", "A style to share?")}</h2>
        </div>
        <Link href="/modeles/proposer" style={{ display: "contents" }}>
          <Button variant="ghost">{tr("Proposer un modèle", "Suggest a style")}</Button>
        </Link>
      </section>
    </div>
  );
}

function ModelSection({
  title,
  models,
  href,
  selection,
}: {
  title: string;
  models: GarmentModel[] | null;
  href: string;
  selection: string[];
}) {
  // Une section vide disparait — comme sur le mobile, ou une categorie sans
  // modele n'affiche pas d'en-tete orpheline.
  if (models !== null && models.length === 0) return null;

  return (
    <section className="homeSection">
      <div className="homeSectionHead">
        <h2 className="homeSectionTitle">{title}</h2>
        <Link href={href} className="homeSeeAll">
          {tr("Voir plus", "See more")} <IconChevronRight size={14} aria-hidden />
        </Link>
      </div>
      {models === null ? (
        <Spinner />
      ) : (
        <div className="homeRail">
          {models.map((m) => (
            <ModelCard key={m.id} model={m} selected={selection.includes(m.id)} suite={models.map((x) => x.id)} />
          ))}
        </div>
      )}
    </section>
  );
}
