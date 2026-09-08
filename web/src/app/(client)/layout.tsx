"use client";

import { RequireRole } from "@/components/RequireRole";
import { Shell, CLIENT_NAV } from "@/components/Shell";

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireRole role="client">
      <Shell nav={CLIENT_NAV}>{children}</Shell>
    </RequireRole>
  );
}
