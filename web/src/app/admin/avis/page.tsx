"use client";

// Moderation des avis clients : masquer ou afficher un avis selon sa qualite.

import { useCallback, useEffect, useState } from "react";
import { AdminApi } from "@/lib/api/endpoints";
import type { Review } from "@/lib/api/types";
import { Badge, Button, Card, EmptyState, ErrorBanner, PageHeader, Spinner } from "@/components/ui";
import { IconReviews } from "@/components/icons";

function Stars({ value }: { value: number }) {
  return (
    <span aria-label={`${value} étoile(s) sur 5`}>
      {"★".repeat(value)}
      <span style={{ color: "var(--border)" }}>{"★".repeat(Math.max(0, 5 - value))}</span>
    </span>
  );
}

export default function AdminReviews() {
  const [reviews, setReviews] = useState<Review[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setError("");
    AdminApi.reviews()
      .then(setReviews)
      .catch((e: Error) => {
        setError(e.message);
        setReviews([]);
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const moderate = async (id: string, status: string) => {
    setBusyId(id);
    setError("");
    try {
      await AdminApi.moderateReview(id, status);
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const tone = (status: string) =>
    status === "visible" ? "success" : status === "flagged" ? "pending" : "error";

  return (
    <div className="container">
      <PageHeader title="Avis" />
      <div className="section">
        <ErrorBanner message={error} />

        {!reviews ? (
          <Spinner label="Chargement des avis…" />
        ) : reviews.length === 0 ? (
          <EmptyState icon={<IconReviews size={30} strokeWidth={1.6} />} title="Aucun avis" body="Aucun avis à modérer pour le moment." />
        ) : (
          <div className="adminStack">
            {reviews.map((r) => (
              <Card key={r.id}>
                <div className="rowTop">
                  <Stars value={r.stars} />
                  <Badge tone={tone(r.moderation_status) as never}>{r.moderation_status}</Badge>
                </div>
                {r.comment && <p style={{ margin: "8px 0" }}>{r.comment}</p>}
                <div className="adminActions">
                  <Button
                    variant="secondary"
                    disabled={busyId === r.id}
                    onClick={() => moderate(r.id, "visible")}
                  >
                    Afficher
                  </Button>
                  <Button variant="danger" disabled={busyId === r.id} onClick={() => moderate(r.id, "hidden")}>
                    Masquer
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}