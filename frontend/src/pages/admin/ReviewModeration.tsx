import React, { useEffect, useState } from "react";
import { AdminApi } from "../../api/endpoints";
import type { Review } from "../../api/types";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { StatusChip } from "../../components/Chip";
import { EmptyState, Header, Spinner } from "../../components/Misc";
import { Stars } from "../../components/Stars";

export default function ReviewModeration() {
  const [reviews, setReviews] = useState<Review[] | null>(null);

  const load = () => AdminApi.reviews().then(setReviews);
  useEffect(() => {
    load();
  }, []);

  const moderate = async (id: string, status: string) => {
    await AdminApi.moderateReview(id, status);
    load();
  };

  if (!reviews) return <Spinner />;

  return (
    <div>
      <Header title="Modération avis" />
      <div style={{ padding: 18 }}>
        {reviews.length === 0 ? (
          <EmptyState text="Aucun avis." />
        ) : (
          reviews.map((r) => (
            <Card key={r.id} style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <Stars value={r.stars} />
                <StatusChip
                  status={r.moderation_status === "visible" ? "success" : r.moderation_status === "flagged" ? "pending" : "error"}
                  label={r.moderation_status}
                />
              </div>
              <p style={{ fontSize: 13, margin: "8px 0" }}>{r.comment}</p>
              <div style={{ display: "flex", gap: 8 }}>
                <Button variant="secondary" onClick={() => moderate(r.id, "visible")} style={{ flex: 1 }}>
                  Visible
                </Button>
                <Button variant="danger" onClick={() => moderate(r.id, "hidden")} style={{ flex: 1 }}>
                  Masquer
                </Button>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
