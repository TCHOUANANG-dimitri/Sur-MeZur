import React, { useEffect, useState } from "react";
import { AdminApi } from "../../api/endpoints";
import type { TailorProfile } from "../../api/types";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { EmptyState, Header, Spinner } from "../../components/Misc";
import { colors } from "../../theme/tokens";

export default function Verifications() {
  const [tailors, setTailors] = useState<TailorProfile[] | null>(null);

  const load = () => AdminApi.pendingVerifications().then(setTailors);
  useEffect(() => {
    load();
  }, []);

  const decide = async (id: string, status: "approved" | "rejected") => {
    await AdminApi.decideVerification(id, status);
    load();
  };

  if (!tailors) return <Spinner />;

  return (
    <div>
      <Header title="Vérifications" />
      <div style={{ padding: 18 }}>
        {tailors.length === 0 ? (
          <EmptyState text="Aucune vérification en attente." />
        ) : (
          tailors.map((tl) => (
            <Card key={tl.id} style={{ marginBottom: 10 }}>
              <strong style={{ fontSize: 13 }}>{tl.shop_name}</strong>
              <p style={{ fontSize: 12, color: colors.textSecondary, margin: "4px 0 10px" }}>
                {tl.tailor_type} · {tl.city}
              </p>
              <p style={{ fontSize: 12, margin: "0 0 10px" }}>{tl.bio}</p>
              <div style={{ display: "flex", gap: 8 }}>
                <Button variant="danger" onClick={() => decide(tl.id, "rejected")} style={{ flex: 1 }}>
                  Rejeter
                </Button>
                <Button onClick={() => decide(tl.id, "approved")} style={{ flex: 1 }}>
                  Approuver
                </Button>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
