import React, { useEffect, useState } from "react";
import { AdminApi } from "../../api/endpoints";
import type { TailorProfile, VerificationDocument } from "../../api/types";
import { Button } from "../../components/Button";
import { EmptyState, Header, Spinner } from "../../components/Misc";
import { colors, radii } from "../../theme/tokens";

const DOC_LABELS: Record<string, string> = {
  id_card: "Pièce d'identité",
  portfolio: "Portfolio",
  atelier_photo: "Photo de l'atelier",
};

export default function Verifications() {
  const [tailors, setTailors] = useState<TailorProfile[] | null>(null);
  const [docsMap, setDocsMap] = useState<Record<string, VerificationDocument[]>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = () => AdminApi.pendingVerifications().then(setTailors);
  useEffect(() => { load(); }, []);

  const toggleDocs = async (tl: TailorProfile) => {
    if (expandedId === tl.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(tl.id);
    if (!docsMap[tl.id]) {
      const docs = await AdminApi.getVerificationDocuments(tl.id);
      setDocsMap((prev) => ({ ...prev, [tl.id]: docs }));
    }
  };

  const decide = async (id: string, status: "approved" | "rejected") => {
    await AdminApi.decideVerification(id, status);
    load();
    setExpandedId(null);
  };

  if (!tailors) return <Spinner />;

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <Header title="Vérifications" />
      <div style={{ flex: 1, overflowY: "auto", padding: 18 }}>
        {tailors.length === 0 ? (
          <EmptyState text="Aucune vérification en attente." />
        ) : (
          tailors.map((tl) => (
            <div
              key={tl.id}
              style={{
                background: colors.white,
                borderRadius: radii.card,
                border: `1px solid ${colors.border}`,
                marginBottom: 14,
                overflow: "hidden",
              }}
            >
              {tl.atelier_photo_url && (
                <div
                  style={{
                    height: 140,
                    background: `url(${tl.atelier_photo_url}) center/cover`,
                  }}
                />
              )}

              <div style={{ padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div style={{ flex: 1 }}>
                    <strong style={{ fontSize: 14, color: colors.indigoText }}>
                      {tl.shop_name}
                    </strong>
                    <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 4 }}>
                      <span style={{
                        fontSize: 10,
                        fontWeight: 700,
                        textTransform: "uppercase",
                        padding: "2px 8px",
                        borderRadius: radii.chip,
                        background: tl.tailor_type === "atelier" ? "#EDE9FE" : "#DBEAFE",
                        color: tl.tailor_type === "atelier" ? colors.violetPrimary : "#2563EB",
                      }}>
                        {tl.tailor_type === "atelier" ? "Atelier" : "Individuel"}
                      </span>
                      {tl.city && (
                        <span style={{ fontSize: 11, color: colors.textSecondary }}>
                          {tl.city}
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 11, color: colors.textSecondary }}>
                      {tl.rating_avg > 0 && `★ ${tl.rating_avg.toFixed(1)}`}
                    </div>
                    <div style={{ fontSize: 11, color: colors.textSecondary }}>
                      {tl.completed_orders_count} commande{tl.completed_orders_count > 1 ? "s" : ""}
                    </div>
                  </div>
                </div>

                {tl.bio && (
                  <p style={{ fontSize: 12, color: colors.textSecondary, margin: "10px 0 0", lineHeight: 1.4 }}>
                    {tl.bio}
                  </p>
                )}

                <button
                  onClick={() => toggleDocs(tl)}
                  style={{
                    display: "block",
                    width: "100%",
                    marginTop: 12,
                    padding: "8px 0",
                    background: colors.backgroundAlt,
                    border: "none",
                    borderRadius: radii.button,
                    fontSize: 12,
                    fontWeight: 600,
                    color: colors.violetPrimary,
                    cursor: "pointer",
                  }}
                >
                  {expandedId === tl.id ? "Masquer les documents" : "Voir les documents"}
                </button>

                {expandedId === tl.id && docsMap[tl.id] && (
                  <div style={{ marginTop: 10 }}>
                    {docsMap[tl.id].length === 0 ? (
                      <p style={{ fontSize: 12, color: colors.textSecondary, textAlign: "center", padding: 10 }}>
                        Aucun document soumis.
                      </p>
                    ) : (
                      docsMap[tl.id].map((doc) => (
                        <div
                          key={doc.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: "8px 0",
                            borderBottom: `1px solid ${colors.border}`,
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontSize: 16 }}>📄</span>
                            <div>
                              <span style={{ fontSize: 12, fontWeight: 600 }}>
                                {DOC_LABELS[doc.type] || doc.type}
                              </span>
                              <span style={{
                                display: "inline-block",
                                marginLeft: 6,
                                fontSize: 10,
                                padding: "1px 6px",
                                borderRadius: radii.chip,
                                background: doc.status === "approved" ? "#DCFCE7" : doc.status === "rejected" ? "#FEE2E2" : "#FEF3C7",
                                color: doc.status === "approved" ? "#16A34A" : doc.status === "rejected" ? "#DC2626" : "#D97706",
                              }}>
                                {doc.status === "approved" ? "Approuvé" : doc.status === "rejected" ? "Rejeté" : "En attente"}
                              </span>
                            </div>
                          </div>
                          <a
                            href={doc.file_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              fontSize: 12,
                              color: colors.violetPrimary,
                              fontWeight: 600,
                              textDecoration: "none",
                            }}
                          >
                            Ouvrir
                          </a>
                        </div>
                      ))
                    )}
                  </div>
                )}

                <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                  <Button
                    variant="danger"
                    onClick={() => decide(tl.id, "rejected")}
                    style={{ flex: 1 }}
                  >
                    Rejeter
                  </Button>
                  <Button
                    onClick={() => decide(tl.id, "approved")}
                    style={{ flex: 1 }}
                  >
                    Approuver
                  </Button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
