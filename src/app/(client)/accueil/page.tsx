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
import { CatalogApi, MeasurementsApi } from "@/lib/api/endpoints";
import type { Category, GarmentModel, Measurement } from "@/lib/api/types";
import { useAuth } from "@/components/AuthProvider";
import { ModelCard } from "@/components/ModelCard";
import { getSelection, onSelectionChange } from "@/lib/selection";
import { Button, Spinner } from "@/components/ui";
import { IconChevronRight, IconSearch } from "@/components/icons";

export default function Accueil() {
  const { user } = useAuth();
  const [popular, setPopular] = useState<GarmentModel[] | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [byCategory, setByCategory] = useState<Record<string, GarmentModel[]>>({});
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [selection, setSelection] = useState<string[]>([]);

  useEffect(() => {
    CatalogApi.models({ sort: "popular", limit: 10 })
      .then(setPopular)
      .catch(() => setPopular([]));

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
          <p className="homeHello">Bonjour{firstName ? `, ${firstName}` : ""}</p>
          <p className="homeBrand">Sur-MeZur</p>
        </div>
      </div>

      <Link href="/modeles" className="homeSearchBar">
        <IconSearch size={16} aria-hidden />
        <span>Rechercher un modèle</span>
      </Link>

      {/* Rappel de mesure : la raison d'etre de cette version web. */}
      <section className="homeMeasureCta">
        <div>
          <h2>{latest ? "Vos mesures sont prêtes" : "Prenez vos mesures"}</h2>
          <p>
            {latest
              ? "Consultez-les, ou téléchargez vos fiches à remettre au tailleur."
              : "Deux photos suffisent pour obtenir vos douze mesures de couture."}
          </p>
        </div>
        <Link
          href={latest ? `/mesures/${latest.id}` : "/mesures/nouvelle"}
          style={{ display: "contents" }}
        >
          <Button block>{latest ? "Voir mes mesures" : "Commencer"}</Button>
        </Link>
      </section>

      <ModelSection title="Les plus aimés" models={popular} href="/modeles?tri=populaire" selection={selection} />

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
          <h2>Un modèle à partager ?</h2>
          <p className="muted">
            Proposez-le au catalogue : il sera visible par toute la communauté.
          </p>
        </div>
        <Link href="/modeles/proposer" style={{ display: "contents" }}>
          <Button variant="ghost">Proposer un modèle</Button>
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
          Voir plus <IconChevronRight size={14} aria-hidden />
        </Link>
      </div>
      {models === null ? (
        <Spinner />
      ) : (
        <div className="homeRail">
          {models.map((m) => (
            <ModelCard key={m.id} model={m} selected={selection.includes(m.id)} />
          ))}
        </div>
      )}
    </section>
  );
}
