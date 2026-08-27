import React, { useEffect, useState } from "react";
import { AdminApi } from "../../api/endpoints";
import type { TailorProfile, VerificationDocument } from "../../api/types";
import { Button } from "../../components/Button";
import { EmptyState, Header, Spinner } from "../../components/Misc";
import { colors, radii } from "../../theme/tokens";

const DOC_LABELS: Record<string, string> = {
  id_card: "Pièce d'identité",
  self_photo: "Photo du tailleur",
  atelier_photo: "Photo de l'atelier",
};

const CHECKLIST_ITEMS = [
  { key: "id_card", label: "Identité vérifiée", desc: "Nom, photo, cohérence avec le profil" },
  { key: "atelier_photo", label: "Atelier vérifié", desc: "Localisation, existence réelle" },
  { key: "self_photo", label: "Photo vérifiée", desc: "Correspond à la pièce d'identité" },
] as const;

const STATUS_STYLES: Record<string, { bg: string; fg: string; label: string }> = {
  pending: { bg: "#FEF3C7", fg: "#92400E", label: "En attente" },
  approved: { bg: "#D1FAE5", fg: "#065F46", label: "Approuvé" },
  rejected: { bg: "#FEE2E2", fg: "#991B1B", label: "Rejeté" },
};

const FILTER_TABS = [
  { key: null, label: "Tous" },
  { key: "pending", label: "En attente" },
  { key: "approved", label: "Approuvés" },
  { key: "rejected", label: "Rejetés" },
] as const;

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLES[status] || STATUS_STYLES.pending;
  return (
    <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: radii.chip, background: s.bg, color: s.fg, fontSize: 11, fontWeight: 700 }}>
      {s.label}
    </span>
  );
}

export default function Verifications() {
  const [tailors, setTailors] = useState<TailorProfile[] | null>(null);
  const [docsMap, setDocsMap] = useState<Record<string, VerificationDocument[]>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [rejectReason, setRejectReason] = useState("");
  const [showRejectField, setShowRejectField] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [filter, setFilter] = useState<string | null>(null);

  const load = (status?: string) => AdminApi.pendingVerifications(status).then(setTailors);
  useEffect(() => { load(filter || undefined); }, [filter]);

  const toggleDocs = async (tl: TailorProfile) => {
    if (expandedId === tl.id) {
      setExpandedId(null);
      setChecked({});
      setShowRejectField(false);
      setRejectReason("");
      return;
    }
    setExpandedId(tl.id);
    setChecked({});
    setShowRejectField(false);
    setRejectReason("");
    if (!docsMap[tl.id]) {
      const docs = await AdminApi.getVerificationDocuments(tl.id);
      setDocsMap((prev) => ({ ...prev, [tl.id]: docs }));
    }
  };

  const allChecked = expandedId ? CHECKLIST_ITEMS.every((item) => checked[item.key]) : false;

  const approve = async (id: string) => {
    if (!allChecked) return;
    setProcessing(true);
    await AdminApi.decideVerification(id, "approved");
    load(filter || undefined);
    setExpandedId(null);
    setProcessing(false);
  };

  const reject = async (id: string) => {
    if (!rejectReason.trim()) return;
    setProcessing(true);
    await AdminApi.decideVerification(id, "rejected", rejectReason.trim());
    load(filter || undefined);
    setExpandedId(null);
    setProcessing(false);
  };

  if (!tailors) return <Spinner />;

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <Header title="Vérifications" />

      {/* Filtres */}
      <div style={{ display: "flex", gap: 8, padding: "12px 18px 0", overflowX: "auto" }}>
        {FILTER_TABS.map((tab) => {
          const isActive = filter === tab.key;
          return (
            <button
              key={tab.key ?? "all"}
              onClick={() => setFilter(tab.key)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                padding: "7px 14px",
                borderRadius: 20,
                border: `1.5px solid ${isActive ? colors.violetPrimary : colors.border}`,
                background: isActive ? colors.violetPrimary : colors.white,
                color: isActive ? "#fff" : colors.textSecondary,
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                whiteSpace: "nowrap",
                transition: "all 0.15s ease",
                boxShadow: isActive ? `0 2px 8px ${colors.violetPrimary}33` : "none",
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Liste */}
      <div style={{ flex: 1, overflowY: "auto", padding: 18 }}>
        {tailors.length === 0 ? (
          <EmptyState text="Aucune vérification dans cette catégorie." />
        ) : (
          <>
            <p style={{ fontSize: 12, color: colors.textSecondary, margin: "0 0 14px" }}>
              {tailors.length} demande{tailors.length > 1 && "s"}
            </p>
            {tailors.map((tl) => {
              const isExpanded = expandedId === tl.id;
              const docs = docsMap[tl.id];
              return (
                <div
                  key={tl.id}
                  style={{
                    border: `1px solid ${isExpanded ? colors.violetPrimary : colors.border}`,
                    borderRadius: radii.card,
                    background: colors.white,
                    marginBottom: 12,
                    overflow: "hidden",
                    transition: "border-color 0.15s ease",
                  }}
                >
                  {/* Résumé */}
                  <div
                    onClick={() => toggleDocs(tl)}
                    style={{ display: "flex", alignItems: "center", gap: 12, padding: 14, cursor: "pointer" }}
                  >
                    {(tl.photo_url || tl.atelier_photo_url) ? (
                      <img
                        src={tl.photo_url || tl.atelier_photo_url || ""}
                        alt=""
                        style={{ width: 44, height: 44, borderRadius: "50%", objectFit: "cover", border: `2px solid ${colors.border}` }}
                      />
                    ) : (
                      <div style={{ width: 44, height: 44, borderRadius: "50%", background: colors.backgroundAlt, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, border: `2px solid ${colors.border}` }}>
                        👤
                      </div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontWeight: 600, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {tl.shop_name || "Sans nom"}
                      </p>
                      <p style={{ margin: "2px 0 0", fontSize: 12, color: colors.textSecondary, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {tl.city || ""}{tl.city && tl.quartier ? ", " : ""}{tl.quartier || ""}
                      </p>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                      <StatusBadge status={tl.verification_status || "pending"} />
                      <span style={{ fontSize: 14, color: colors.textSecondary, transform: isExpanded ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>
                        ▾
                      </span>
                    </div>
                  </div>

                  {/* Détail */}
                  {isExpanded && (
                    <div style={{ padding: "0 14px 14px", borderTop: `1px solid ${colors.border}` }}>

                      {/* Documents */}
                      {docs ? (
                        <div style={{ display: "flex", gap: 8, overflowX: "auto", margin: "12px 0" }}>
                          {docs.map((doc) => (
                            <div key={doc.id} style={{ minWidth: 140, textAlign: "center", flexShrink: 0 }}>
                              {doc.file_url ? (
                                <a href={doc.file_url} target="_blank" rel="noreferrer">
                                  <img
                                    src={doc.file_url}
                                    alt={DOC_LABELS[doc.type] || doc.type}
                                    style={{ width: 140, height: 100, objectFit: "cover", borderRadius: radii.card, border: `1px solid ${colors.border}` }}
                                  />
                                </a>
                              ) : (
                                <div style={{ width: 140, height: 100, borderRadius: radii.card, background: colors.backgroundAlt, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                  <span style={{ fontSize: 11, color: colors.textSecondary }}>Pas de fichier</span>
                                </div>
                              )}
                              <p style={{ margin: "4px 0 0", fontSize: 11, fontWeight: 600 }}>
                                {DOC_LABELS[doc.type] || doc.type}
                              </p>
                              <StatusBadge status={doc.status || "pending"} />
                            </div>
                          ))}
                        </div>
                      ) : (
                        <Spinner />
                      )}

                      {/* Checklist */}
                      <div style={{ background: colors.backgroundAlt, borderRadius: radii.card, padding: 12, marginBottom: 12 }}>
                        <p style={{ margin: "0 0 8px", fontSize: 12, fontWeight: 700, color: colors.indigoText }}>
                          Vérification obligatoire
                        </p>
                        {CHECKLIST_ITEMS.map((item) => (
                          <label
                            key={item.key}
                            style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "6px 0", cursor: "pointer" }}
                          >
                            <input
                              type="checkbox"
                              checked={!!checked[item.key]}
                              onChange={(e) => setChecked((prev) => ({ ...prev, [item.key]: e.target.checked }))}
                              style={{ marginTop: 2, width: 16, height: 16, accentColor: colors.violetPrimary }}
                            />
                            <div>
                              <p style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>{item.label}</p>
                              <p style={{ margin: 0, fontSize: 11, color: colors.textSecondary }}>{item.desc}</p>
                            </div>
                          </label>
                        ))}
                      </div>

                      {/* Motif de rejet */}
                      {showRejectField ? (
                        <div style={{ marginBottom: 10 }}>
                          <textarea
                            placeholder="Motif du rejet (obligatoire)"
                            value={rejectReason}
                            onChange={(e) => setRejectReason(e.target.value)}
                            rows={3}
                            style={{
                              width: "100%",
                              padding: 10,
                              border: `1px solid #EF4444`,
                              borderRadius: radii.card,
                              fontSize: 13,
                              resize: "vertical",
                              boxSizing: "border-box",
                            }}
                          />
                          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                            <Button
                              fullWidth
                              variant="secondary"
                              disabled={!rejectReason.trim() || processing}
                              onClick={() => reject(tl.id)}
                              style={{ borderColor: "#EF4444", color: "#EF4444" }}
                            >
                              Confirmer le rejet
                            </Button>
                            <Button
                              fullWidth
                              variant="secondary"
                              onClick={() => { setShowRejectField(false); setRejectReason(""); }}
                            >
                              Annuler
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: "flex", gap: 8 }}>
                          <Button
                            fullWidth
                            disabled={!allChecked || processing}
                            onClick={() => approve(tl.id)}
                          >
                            Approuver
                          </Button>
                          <Button
                            fullWidth
                            variant="secondary"
                            onClick={() => setShowRejectField(true)}
                            style={{ borderColor: "#EF4444", color: "#EF4444" }}
                          >
                            Rejeter
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
