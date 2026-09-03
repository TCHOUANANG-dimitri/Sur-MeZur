"use client";

// Coquille commune a toutes les pages admin : garde de route (seuls les
// admins passent) puis navigation via la coquille partagee. La feuille de
// style admin est importee ici, une seule fois, pour la section entiere.

import { RequireRole } from "@/components/RequireRole";
import { ADMIN_NAV, Shell } from "@/components/Shell";
import "@/styles/admin.css";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireRole role="admin">
      <Shell nav={ADMIN_NAV}>{children}</Shell>
    </RequireRole>
  );
}
