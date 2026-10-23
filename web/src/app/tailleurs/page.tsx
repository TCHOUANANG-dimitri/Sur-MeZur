"use client";

/**
 * Annuaire des tailleurs : recherche, ville, tri par note ou par proximite.
 *
 * « Plus proches » demande la position du navigateur ; en cas de refus, un
 * message l'explique et le tri revient a la note. `?modele=<id>` (venu de la
 * fiche d'un modele) suit jusqu'au formulaire de commande.
 */

import { tr } from "@/lib/i18n";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { TailorsApi } from "@/lib/api/endpoints";
import type { TailorProfile } from "@/lib/api/types";
import { Badge, EmptyState, ErrorBanner, Input, PageHeader, Select, Spinner } from "@/components/ui";
import { IconLocation, IconReviews, IconSearch, IconTailor } from "@/components/icons";
import { currentPosition, formatDistance, tailorPlace } from "@/lib/tailors";

type Sort = "rating" | "proximity";

function TailleursInner() {
  const params = useSearchParams();
  const modele = params.get("modele");
  const [all, setAll] = useState<TailorProfile[] | null>(null);
  const [list, setList] = useState<TailorProfile[] | null>(null);
  const [q, setQ] = useState("");
  const [city, setCity] = useState("");
  const [sort, setSort] = useState<Sort>("rating");
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Liste complete, une fois : elle donne les villes du menu deroulant.
  useEffect(() => {
    TailorsApi.search()
      .then(setAll)
      .catch(() => setAll([]));
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      TailorsApi.search({
        ...(q.trim() ? { q: q.trim() } : {}),
        ...(city ? { city } : {}),
        ...(sort === "proximity" && position ? { sort: "proximity", lat: position.lat, lng: position.lng } : {}),
      })
        .then((r) => {
          setList(r);
          setError("");
        })
        .catch((e) => {
          setError(e instanceof Error ? e.message : tr("Chargement impossible.", "Could not load."));
          setList([]);
        });
    }, 250);
    return () => clearTimeout(timer);
  }, [q, city, sort, position]);

  const cities = useMemo(() => {
    const set = new Map<string, string>();
    for (const t of all ?? []) {
      const c = t.city?.trim();
      if (c && !set.has(c.toLowerCase())) set.set(c.toLowerCase(), c);
    }
    return [...set.values()].sort((a, b) => a.localeCompare(b, "fr"));
  }, [all]);

  async function changeSort(next: Sort) {
    setNotice("");
    if (next === "rating") {
      setSort("rating");
      return;
    }
    try {
      setPosition(await currentPosition());
      setSort("proximity");
    } catch (e) {
      setSort("rating");
      setNotice(`${e instanceof Error ? e.message : tr("Position indisponible.", "Location unavailable.")} ${tr("Tri par note.", "Sorted by rating.")}`);
    }
  }

  const suffix = modele ? `?modele=${encodeURIComponent(modele)}` : "";

  return (
    <>
      <PageHeader title={tr("Tailleurs", "Tailors")} />
      <div className="container section stack">
        {modele && (
          <div className="banner bannerInfo">{tr("Choisissez votre tailleur.", "Choose your tailor.")}</div>
        )}
        <label className="field" style={{ marginBottom: 0 }}>
          <span className="fieldLabel">{tr("Rechercher", "Search")}</span>
          <div style={{ position: "relative" }}>
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={tr("Atelier, quartier…", "Workshop, area…")}
              aria-label={tr("Rechercher un tailleur", "Search tailors")}
              maxLength={80}
              style={{ paddingLeft: 38 }}
            />
            <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", display: "flex" }} aria-hidden>
              <IconSearch size={18} />
            </span>
          </div>
        </label>
        <div className="galleryFilterBar tFilterPair">
          <label className={`filterSelect ${city ? "filterSelectOn" : ""}`}>
            <span>{tr("Ville", "City")}</span>
            <Select value={city} onChange={(e) => setCity(e.target.value)}>
              <option value="">{tr("Toutes", "All")}</option>
              {cities.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </Select>
          </label>
          <label className={`filterSelect ${sort !== "rating" ? "filterSelectOn" : ""}`}>
            <span>{tr("Trier", "Sort")}</span>
            <Select value={sort} onChange={(e) => void changeSort(e.target.value as Sort)}>
              <option value="rating">{tr("Mieux notés", "Top rated")}</option>
              <option value="proximity">{tr("Plus proches", "Nearest")}</option>
            </Select>
          </label>
        </div>
        {notice && <p className="tNotice" role="status">{notice}</p>}
        <ErrorBanner message={error} />

        {list === null ? (
          <Spinner />
        ) : list.length === 0 ? (
          <EmptyState
            icon={<IconTailor size={30} strokeWidth={1.6} />}
            title={tr("Aucun tailleur trouvé", "No tailors found")}
          />
        ) : (
          <ul className="tList" aria-label={tr("Tailleurs", "Tailors")}>
            {list.map((t) => {
              const lieu = tailorPlace(t);
              const distance = formatDistance(t.distance_km);
              return (
                <li key={t.id}>
                  <Link href={`/tailleurs/${t.id}${suffix}`} className="tRow">
                    <span className="tailorThumb" aria-hidden>
                      {t.atelier_photo_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={t.atelier_photo_url} alt="" />
                      ) : (
                        t.shop_name.charAt(0).toUpperCase()
                      )}
                    </span>
                    <span className="tRowMain">
                      <span className="tRowTitle">{t.shop_name}</span>
                      {t.verification_enabled !== false && t.verification_status === "approved" && (
                        <> <Badge tone="success">{tr("Vérifié", "Verified")}</Badge></>
                      )}
                      <br />
                      <span className="tRowSub">
                        {lieu && (
                          <>
                            <IconLocation size={13} aria-hidden /> {lieu}
                          </>
                        )}
                        {distance && <> · {distance}</>}
                        {t.rating_avg > 0 && (
                          <>
                            {lieu || distance ? " · " : ""}
                            <IconReviews size={13} aria-hidden /> {Number(t.rating_avg).toFixed(1).replace(".", ",")}
                          </>
                        )}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}

export default function Tailleurs() {
  return (
    <Suspense fallback={<Spinner />}>
      <TailleursInner />
    </Suspense>
  );
}
