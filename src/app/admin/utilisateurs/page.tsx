"use client";

// Utilisateurs : liste filtrée par rôle, recherche par nom, et suspension /
// réactivation des comptes (jamais pour un administrateur).

import { useCallback, useEffect, useState } from "react";
import { AdminApi } from "@/lib/api/endpoints";
import type { User } from "@/lib/api/types";
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
import { formatDate } from "@/components/admin/format";

type RoleFilter = "all" | "client" | "tailor" | "admin";

const ROLE_LABEL: Record<RoleFilter, string> = {
  all: "Tous",
  client: "Clients",
  tailor: "Tailleurs",
  admin: "Admins",
};

const ROLE_ICON: Record<string, string> = {
  client: "👤",
  tailor: "✂️",
  admin: "🛡️",
};

export default function AdminUsers() {
  const [users, setUsers] = useState<User[] | null>(null);
  const [role, setRole] = useState<RoleFilter>("all");
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setError("");
    AdminApi.users({ role: role === "all" ? undefined : role, q: query || undefined })
      .then(setUsers)
      .catch((e: Error) => {
        setError(e.message);
        setUsers([]);
      });
  }, [role, query]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleActive = async (u: User) => {
    const suspending = u.is_active;
    if (!window.confirm(`${u.full_name} · ${suspending ? "Suspendre le compte ?" : "Réactiver le compte ?"}`)) return;
    setBusyId(u.id);
    setError("");
    try {
      const updated = await AdminApi.setUserActive(u.id, !u.is_active);
      setUsers((prev) => prev?.map((x) => (x.id === updated.id ? updated : x)) ?? null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="container">
      <PageHeader title="Utilisateurs" />
      <div className="section">
        <ErrorBanner message={error} />

        <div className="adminSearch">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && load()}
            placeholder="Rechercher par nom…"
          />
          <Button variant="secondary" onClick={load}>
            Rechercher
          </Button>
        </div>

        <div className="chipRow" style={{ marginBottom: 14 }}>
          {(["all", "client", "tailor", "admin"] as RoleFilter[]).map((r) => (
            <Chip key={r} active={role === r} onClick={() => setRole(r)}>
              {ROLE_LABEL[r]}
            </Chip>
          ))}
        </div>

        {!users ? (
          <Spinner label="Chargement…" />
        ) : users.length === 0 ? (
          <EmptyState icon="👥" title="Aucun utilisateur" body="Modifiez le filtre ou la recherche." />
        ) : (
          <div className="adminStack">
            {users.map((u) => (
              <Card key={u.id} variant="flat">
                <div className="rowTop">
                  <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                    <span
                      className="statIcon"
                      aria-hidden
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: 19,
                        background: u.is_active ? "var(--bg-alt)" : "var(--border)",
                        margin: 0,
                        flex: "none",
                      }}
                    >
                      {ROLE_ICON[u.role] ?? "👤"}
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <div className="rowLabel">{u.full_name}</div>
                      <div className="rowMeta">
                        {ROLE_LABEL[u.role] ?? u.role} · {u.phone}
                      </div>
                      <div className="rowMeta">Inscrit le {formatDate(u.created_at)}</div>
                    </div>
                  </div>
                  <Badge tone={u.is_active ? "success" : "error"}>{u.is_active ? "Actif" : "Suspendu"}</Badge>
                </div>

                {u.role !== "admin" && (
                  <div className="adminActions">
                    <Button
                      variant={u.is_active ? "danger" : "secondary"}
                      block
                      disabled={busyId === u.id}
                      onClick={() => toggleActive(u)}
                    >
                      {busyId === u.id
                        ? "…"
                        : u.is_active
                          ? "Suspendre le compte"
                          : "Réactiver le compte"}
                    </Button>
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}