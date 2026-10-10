/**
 * Pages d'information publiques (B2.7) : aide, conditions, confidentialite.
 *
 * `GET /api/public/pages/{slug}` puis rendu Markdown simple et sur (texte
 * echappe, voir `src/lib/markdown.ts`). Page statique par slug, regeneree a
 * chaque visite cote serveur.
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { renderPublicMarkdown } from "@/lib/markdown";

const API_ORIGIN = process.env.API_ORIGIN ?? "http://localhost:8000";

const TITLES: Record<string, string> = {
  faq: "Aide — questions fréquentes",
  conditions: "Conditions d'utilisation",
  confidentialite: "Confidentialité",
};

type Fetched = { title: string; body: string } | "missing" | "unavailable";

async function fetchPage(slug: string): Promise<Fetched> {
  try {
    const res = await fetch(`${API_ORIGIN}/api/public/pages/${slug}`, { next: { revalidate: 300 } });
    if (res.status === 404) return "missing";
    if (!res.ok) return "unavailable";
    return (await res.json()) as { title: string; body: string };
  } catch {
    return "unavailable";
  }
}

export default async function PageInfo({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = await fetchPage(slug);
  // Une page inconnue n'existe pas ; une API injoignable n'est qu'un
  // contretemps : on le dit, plutot que d'afficher « page introuvable ».
  if (page === "missing" && !TITLES[slug]) notFound();
  if (page === "missing" || page === "unavailable") {
    return (
      <main className="containerNarrow section">
        <h1>{TITLES[slug] ?? "Information"}</h1>
        <p>Cette page est momentanément indisponible. Réessayez dans quelques instants.</p>
        <p style={{ marginTop: 24 }}>
          <Link href="/contact" className="authLink">Besoin d&apos;aide ? Contactez-nous</Link>
        </p>
      </main>
    );
  }
  return (
    <main className="containerNarrow section">
      <h1>{page.title || TITLES[slug] || "Information"}</h1>
      <div className="infosBody" dangerouslySetInnerHTML={{ __html: renderPublicMarkdown(page.body) }} />
      <p style={{ marginTop: 24 }}>
        <Link href="/contact" className="authLink">Une autre question ? Contactez-nous</Link>
      </p>
    </main>
  );
}
