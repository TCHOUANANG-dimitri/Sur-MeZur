"use client";

// File d'attente des verifications de tailleurs : filtres par statut, pieces
// justificatives, et decision (approbation via checklist obligatoire, rejet
// avec motif).

import { useCallback, useEffect, useState } from "react";
import { AdminApi } from "@/lib/api/endpoints";
import type { TailorProfile, VerificationDocument } from "@/lib/api/types";
import {
  Badge,
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorBanner,
  Input,
  PageHeader,
  Spinner,
} from "@/components/ui";
import { assetUrl } from "@/components/admin/format";
import { IconVerify } from "@/components/icons";

type FilterKey = "pending" | "approved" | "rejected" | "all";

const CHECKLIST_ITEMS = [
  { key: "id_card", label: "Identité vérifiée", desc: "Nom, photo, cohérence avec le profil" },
  { key: "atelier_photo", label: "Atelier vérifié", desc: "Localisation, existence réelle" },
  { key: "portfolio", label: "Portfolio vérifié", desc: "Qualité des réalisations, cohérence" },
] as const;

const DOC_LABEL: Record<string, string> = {
  id_card: "Identité",
  self_photo: "Photo",
  atelier_photo: "Atelier",
};

const FILTERS: FilterKey[] = ["pending", "approved", "rejected", "all"];

export default function AdminVerifications() {
  const [filter, setFilter] = useState<FilterKey>("pending");
  const [tailors, setTailors] = useState<TailorProfile[] | null>(null);
  const [docs, setDocs] = useState<Record<string, VerificationDocument[]>>({});
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback((f: FilterKey) => {
    setError("");
    AdminApi.pendingVerifications(f === "all" ? undefined : f)
      .then((list) => {
        setTailors(list);
        Promise.all(
          list.map((tl) => AdminApi.getVerificationDocuments(tl.id).catch(() => [] as VerificationDocument[]))
        )
          .then((perTailor) => {
            const map: Record<string, VerificationDocument[]> = {};
            list.forEach((tl, i) => (map[tl.id] = perTailor[i]));
            setDocs(map);
          })
          .catch(() => {});
      })
      .catch((e: Error) => {
        setError(e.message);
        setTailors([]);
      });
  }, []);

  useEffect(() => {
    load(filter);
  }, [filter, load]);

  const allChecked = (id: string) => CHECKLIST_ITEMS.every((it) => checked[`${id}:${it.key}`]);

  const approve = async (id: string) => {
    if (!allChecked(id) || busy) return;
    setBusy(true);
    try {
      await AdminApi.decideVerification(id, "approved");
      load(filter);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const reject = async (id: string) => {
    if (!rejectReason.trim() || busy) return;
    setBusy(true);
    try {
      await AdminApi.decideVerification(id, "rejected", rejectReason.trim());
      setRejectingId(null);
      setRejectReason("");
      load(filter);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const tone = (status: string) =>
    status === "approved" ? "success" : status === "rejected" ? "error" : "pending";

  return (
    <div className="container">
      <PageHeader title="Vérifications" />
      <div className="section">
        <ErrorBanner message={error} />

        <div className="chipRow" style={{ marginBottom: 14 }}>
          {FILTERS.map((f) => (
            <Chip key={f} active={filter === f} onClick={() => setFilter(f)}>
              {f === "all" ? "Toutes" : f === "pending" ? "En attente" : f === "approved" ? "Approuvés" : "Rejetés"}
            </Chip>
          ))}
        </div>

        {!tailors ? (
          <Spinner label="Chargement…" />
        ) : tailors.length === 0 ? (
          <EmptyState icon={<IconVerify size={30} strokeWidth={1.6} />} title="Aucune vérification" body="Aucun tailleur dans cette catégorie." />
        ) : (
          <div className="adminStack">
            {tailors.map((tl) => {
              const tlDocs = docs[tl.id] ?? [];
              return (
                <Card key={tl.id}>
                  <div className="rowTop">
                    <div style={{ minWidth: 0 }}>
                      <div className="rowLabel">{tl.shop_name}</div>
                      <div className="rowMeta">
                        {tl.tailor_type === "atelier" ? "Atelier" : "Individuel"}
                        {tl.city ? ` · ${tl.city}` : ""}
                      </div>
                    </div>
                    <Badge tone={tone(tl.verification_status) as never}>{tl.verification_status}</Badge>
                  </div>

                  {tl.bio && <p className="muted" style={{ margin: "8px 0 0" }}>{tl.bio}</p>}

                  {tlDocs.length > 0 && (
                    <div className="imgRow">
                      {tlDocs.map((d) => (
                        <div key={d.id} className="imgChip">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img className="imgThumb" src={assetUrl(d.file_url)} alt={DOC_LABEL[d.type] ?? d.type} />
                          <span className="imgChipLabel">{DOC_LABEL[d.type] ?? d.type}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {tl.verification_status === "pending" && (
                    <>
                      <div className="checklist">
                        <div className="checklistTitle">Vérification obligatoire</div>
                        {CHECKLIST_ITEMS.map((item) => {
                          const key = `${tl.id}:${item.key}`;
                          const isChecked = !!checked[key];
                          return (
                            <button
                              key={item.key}
                              type="button"
                              className="checkItem"
                              onClick={() => setChecked((prev) => ({ ...prev, [key]: !isChecked }))}
                            >
                              <span className={`checkBox ${isChecked ? "checkBoxActive" : ""}`}>
                                {isChecked ? "✓" : ""}
                              </span>
                              <span className="checkText">
                                <span className="checkLabel" style={{ display: "block" }}>{item.label}</span>
                                <span className="checkDesc">{item.desc}</span>
                              </span>
                            </button>
                          );
                        })}
                      </div>

                      {rejectingId === tl.id ? (
                        <div style={{ marginTop: 10 }}>
                          <Input
                            value={rejectReason}
                            onChange={(e) => setRejectReason(e.target.value)}
                            placeholder="Motif du rejet (obligatoire)"
                            style={{ marginBottom: 8 }}
                          />
                          <div className="adminActions">
                            <Button
                              variant="secondary"
                              disabled={!rejectReason.trim() || busy}
                              onClick={() => reject(tl.id)}
                            >
                              Confirmer le rejet
                            </Button>
                            <Button
                              variant="ghost"
                              onClick={() => {
                                setRejectingId(null);
                                setRejectReason("");
                              }}
                            >
                              Annuler
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="adminActions">
                          <Button variant="danger" disabled={busy} onClick={() => setRejectingId(tl.id)}>
                            Rejeter
                          </Button>
                          <Button disabled={!allChecked(tl.id) || busy} onClick={() => approve(tl.id)}>
                            Approuver
                          </Button>
                        </div>
                      )}
                    </>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
