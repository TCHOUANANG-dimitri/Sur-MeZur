"use client";

// Coquille commune a toutes les pages admin : garde de route (seuls les
// admins passent), contexte de l'administrateur (droits, compteurs),
// confirmations et notifications, puis la coquille de navigation. Les
// feuilles de style admin sont importees ici, une seule fois.

import { Suspense } from "react";
import { RequireRole } from "@/components/RequireRole";
import { AdminProvider } from "@/components/admin/AdminContext";
import { AdminShell } from "@/components/admin/AdminShell";
import { FeedbackProvider } from "@/components/admin/Feedback";
import { Loading } from "@/components/admin/kit";
import "@/styles/admin.css";
import "@/styles/admin-web.css";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireRole role="admin">
      <AdminProvider>
        <FeedbackProvider>
          <AdminShell>
            {/* Les listes lisent leurs filtres dans l'adresse
                (useSearchParams), ce qui exige une frontiere Suspense. */}
            <Suspense fallback={<Loading />}>{children}</Suspense>
          </AdminShell>
        </FeedbackProvider>
      </AdminProvider>
    </RequireRole>
  );
}
