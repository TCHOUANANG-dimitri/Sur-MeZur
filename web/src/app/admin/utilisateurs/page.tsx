"use client";

// Utilisateurs (2.1, 2.2, 2.7, 0.4 a 0.8) : liste paginee, filtres combinables
// conserves dans l'adresse, export, actions groupees, nettoyage des invites.

import Link from "next/link";
import { useState } from "react";
import { Growth, Users, type UserRow } from "@/lib/api/admin";
import { Button } from "@/components/ui";
import { useAdmin } from "@/components/admin/AdminContext";
import { useFeedback, Modal } from "@/components/admin/Feedback";
import {
  DataTable,
  FilterDate,
  FilterSelect,
  FilterText,
  TABLE_DEFAULTS,
  filtersOf,
  tableQuery,
  useUrlState,
  type Column,
} from "@/components/admin/DataTable";
import { PageHead, StatusBadge, useLoad } from "@/components/admin/kit";
import { ROLE_LABEL, USER_STATUS, VERIFICATION_STATUS, ago, formatDate, formatDateTime } from "@/components/admin/format";

const COLUMNS: Column<UserRow>[] = [
  { key: "full_name", label: "Nom", sort: "full_name", render: (u) => u.full_name },
  { key: "phone", label: "Téléphone", render: (u) => u.phone ?? "—" },
  { key: "role", label: "Rôle", sort: "role", render: (u) => ROLE_LABEL[u.role] ?? u.role },
  { key: "status", label: "Statut", render: (u) => <StatusBadge map={USER_STATUS} value={u.status} /> },
  { key: "city", label: "Ville", render: (u) => u.city ?? "—" },
  { key: "verification_status", label: "Vérification", optional: true, render: (u) => (u.verification_status ? <StatusBadge map={VERIFICATION_STATUS} value={u.verification_status} /> : "—") },
  { key: "channel", label: "Canal", optional: true, render: (u) => u.channel ?? "—" },
  { key: "platform", label: "Support", optional: true, render: (u) => (u.platform === "web" ? "Site" : "Application") },
  { key: "email", label: "E-mail", optional: true, render: (u) => u.email ?? "—" },
  { key: "created_at", label: "Inscription", sort: "created_at", render: (u) => formatDate(u.created_at) },
  { key: "last_login_at", label: "Dernière connexion", sort: "last_login_at", render: (u) => <span title={formatDateTime(u.last_login_at)}>{u.last_login_at ? ago(u.last_login_at) : "—"}</span> },
  { key: "last_seen_at", label: "Dernière activité", sort: "last_seen_at", optional: true, render: (u) => <span title={formatDateTime(u.last_seen_at)}>{u.last_seen_at ? ago(u.last_seen_at) : "—"}</span> },
];

export default function UsersPage() {
  const { can } = useAdmin();
  const { confirm, toast } = useFeedback();
  const [s, set] = useUrlState({
    ...TABLE_DEFAULTS,
    q: "",
    role: "",
    status: "",
    city: "",
    platform: "",
    channel_id: "",
    created_from: "",
    created_to: "",
    inactive_days: "",
  });
  const [reload, setReload] = useState(0);
  const [guests, setGuests] = useState(false);
  const segments = useLoad(() => (can("growth") ? Growth.segments() : Promise.resolve({ cities: [], channels: [] })), [can]);

  const bulkAction = async (ids: string[], action: "suspend" | "reactivate" | "delete", done: () => void) => {
    const labels = { suspend: "Suspendre", reactivate: "Réactiver", delete: "Supprimer définitivement" };
    const reason = await confirm({
      title: `${labels[action]} ${ids.length} compte(s) ?`,
      body:
        action === "delete"
          ? "Les comptes et toutes leurs données (mesures, commandes, messages…) seront effacés. Cette action est irréversible."
          : action === "suspend"
            ? "Les personnes ne pourront plus se connecter. Le motif leur est communiqué."
            : undefined,
      danger: action !== "reactivate",
      confirmLabel: labels[action],
      reason: action === "suspend" ? { label: "Motif communiqué aux utilisateurs", required: true } : undefined,
    });
    if (reason === null) return;
    try {
      const r = await Users.bulk(ids, action, reason || undefined);
      done();
      toast(
        `${r.done} compte(s) traité(s)${r.skipped ? `, ${r.skipped} ignoré(s) (administrateurs ou vous-même)` : ""}`,
        action === "suspend" ? { undo: async () => { await Users.bulk(ids, "reactivate"); setReload((n) => n + 1); } } : undefined
      );
    } catch (e) {
      toast((e as Error).message, { error: true });
    }
  };

  return (
    <div className="adPage">
      <PageHead
        title="Utilisateurs"
        sub="Clients, tailleurs, agents de collecte et comptes invités."
        actions={
          <>
            <Link href="/admin/utilisateurs/doublons" className="btn btnSecondary adBtnSm">
              Comptes en double
            </Link>
            <Button variant="secondary" className="adBtnSm" onClick={() => setGuests(true)}>
              Comptes invités
            </Button>
          </>
        }
      />

      <div className="adToolbar">
        <FilterText label="Recherche" value={s.q} onChange={(q) => set({ q })} placeholder="Nom, téléphone, e-mail" wide />
        <FilterSelect label="Rôle" value={s.role} onChange={(role) => set({ role })} options={{ client: "Clients", tailor: "Tailleurs", collector: "Agents de collecte", admin: "Administrateurs" }} />
        <FilterSelect label="Statut" value={s.status} onChange={(status) => set({ status })} options={{ active: "Actifs", suspended: "Suspendus", guest: "Invités" }} allLabel="Inscrits" />
        <FilterSelect
          label="Ville"
          value={s.city}
          onChange={(city) => set({ city })}
          options={(segments.data?.cities ?? []).map((c) => ({ value: c, label: c }))}
          allLabel="Toutes"
        />
        <FilterSelect label="Support" value={s.platform} onChange={(platform) => set({ platform })} options={{ web: "Site web", app: "Application" }} />
        {can("growth") && (
          <FilterSelect
            label="Canal"
            value={s.channel_id}
            onChange={(channel_id) => set({ channel_id })}
            options={(segments.data?.channels ?? []).map((c) => ({ value: c.id, label: c.name }))}
          />
        )}
        <FilterDate label="Inscrits depuis" value={s.created_from} onChange={(created_from) => set({ created_from })} />
        <FilterDate label="Inscrits jusqu'au" value={s.created_to} onChange={(created_to) => set({ created_to })} />
        <FilterSelect
          label="Dernière activité"
          value={s.inactive_days}
          onChange={(inactive_days) => set({ inactive_days })}
          options={{ "7": "Inactifs depuis 7 j", "30": "Inactifs depuis 30 j", "90": "Inactifs depuis 90 j" }}
          allLabel="Indifférente"
        />
      </div>

      <DataTable<UserRow>
        id="users"
        columns={COLUMNS}
        fetcher={Users.table}
        filters={filtersOf(s)}
        query={tableQuery(s)}
        onQuery={set}
        rowKey={(u) => u.id}
        rowHref={(u) => `/admin/utilisateurs/${u.id}`}
        exportPath="/admin/tables/users"
        exportName="utilisateurs"
        selectable={can("users.write")}
        reloadToken={reload}
        bulk={(ids, done) => (
          <>
            <Button variant="secondary" className="adBtnSm" onClick={() => bulkAction(ids, "suspend", done)}>
              Suspendre
            </Button>
            <Button variant="secondary" className="adBtnSm" onClick={() => bulkAction(ids, "reactivate", done)}>
              Réactiver
            </Button>
            {can("users.delete") && (
              <Button variant="danger" className="adBtnSm" onClick={() => bulkAction(ids, "delete", done)}>
                Supprimer
              </Button>
            )}
          </>
        )}
      />

      {guests && <GuestsModal onClose={() => setGuests(false)} onDone={() => setReload((n) => n + 1)} />}
    </div>
  );
}

/** 2.7 — nettoyage des comptes invites restes sans inscription. */
function GuestsModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { can } = useAdmin();
  const { confirm, toast } = useFeedback();
  const preview = useLoad(() => Users.guestsPreview(), []);
  const run = async () => {
    if (
      (await confirm({
        title: `Supprimer ${preview.data?.to_delete ?? 0} compte(s) invité(s) ?`,
        body: "Leurs photos et mesures sont effacées. Ce nettoyage tourne aussi automatiquement chaque jour.",
        danger: true,
        confirmLabel: "Nettoyer maintenant",
      })) === null
    )
      return;
    try {
      const r = await Users.guestsCleanup();
      toast(`${r.deleted} compte(s) invité(s) supprimé(s)`);
      preview.reload();
      onDone();
    } catch (e) {
      toast((e as Error).message, { error: true });
    }
  };
  return (
    <Modal title="Comptes invités" onClose={onClose} actions={<Button variant="secondary" onClick={onClose}>Fermer</Button>}>
      {!preview.data ? (
        <p className="adHint">Chargement…</p>
      ) : (
        <>
          <p>
            Chaque visiteur qui prend ses mesures sans compte crée un compte invité. Ceux restés sans inscription ni activité depuis{" "}
            <strong>{preview.data.retention_days} jours</strong> sont supprimés automatiquement chaque jour, avec leurs photos.
          </p>
          <dl className="adDl">
            <dt>Comptes invités</dt>
            <dd>{preview.data.guests_total}</dd>
            <dt>À supprimer aujourd&apos;hui</dt>
            <dd>{preview.data.to_delete}</dd>
          </dl>
          <p className="adHint">La durée se règle dans Réglages.</p>
          {can("users.delete") && (
            <Button variant="danger" onClick={run} disabled={!preview.data.to_delete}>
              Nettoyer maintenant
            </Button>
          )}
        </>
      )}
    </Modal>
  );
}
