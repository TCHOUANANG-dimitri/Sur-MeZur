/** Dates arrive as ISO strings from the API; the tailor-facing screens show
 *  them in the app's locale so order/delivery planning reads naturally. */

export function formatDate(iso: string | null | undefined, lang: "fr" | "en" = "fr"): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(lang === "fr" ? "fr-FR" : "en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/** Signed day delta vs today — negative means overdue. */
export function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  const a = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const b = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((a - b) / 86400000);
}

/** Short human hint for a due date, e.g. "dans 3 j", "aujourd'hui", "en retard de 2 j". */
export function dueLabel(iso: string | null | undefined, lang: "fr" | "en" = "fr"): string | null {
  const n = daysUntil(iso);
  if (n === null) return null;
  if (lang === "en") {
    if (n === 0) return "today";
    return n > 0 ? `in ${n} d` : `${-n} d overdue`;
  }
  if (n === 0) return "aujourd'hui";
  return n > 0 ? `dans ${n} j` : `en retard de ${-n} j`;
}
