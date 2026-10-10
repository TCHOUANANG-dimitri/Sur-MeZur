"use client";

import { RequireRole } from "@/components/RequireRole";
import { Shell, TAILOR_NAV } from "@/components/Shell";

export default function TailleurLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireRole role="tailor">
      <Shell nav={TAILOR_NAV}>{children}</Shell>
    </RequireRole>
  );
}
