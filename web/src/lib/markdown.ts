/**
 * Texte formate minimal (titres, listes, **gras**, liens) pour les pages
 * d'information publiques (/infos/[slug]).
 *
 * Copie de `renderMarkdown` de `components/admin/kit.tsx` (ne pas l'importer :
 * ce module vit hors de `admin/` et doit rester utilisable par les pages
 * publiques). Le texte est echappe AVANT mise en forme : aucune balise
 * saisie ne passe telle quelle.
 */
export function renderPublicMarkdown(src: string): string {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const inline = (s: string) =>
    esc(s)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(
        /\[([^\]]+)\]\((https?:\/\/[^)\s]+|\/[^)\s]*)\)/g,
        '<a href="$2" rel="noopener">$1</a>'
      );
  const out: string[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) out.push(`<ul>${list.map((l) => `<li>${l}</li>`).join("")}</ul>`);
    list = [];
  };
  for (const block of src.replace(/\r/g, "").split("\n")) {
    const line = block.trim();
    if (!line) {
      flush();
      continue;
    }
    if (line.startsWith("- ") || line.startsWith("* ")) {
      list.push(inline(line.slice(2)));
      continue;
    }
    flush();
    if (line.startsWith("### ")) out.push(`<h3>${inline(line.slice(4))}</h3>`);
    else if (line.startsWith("## ")) out.push(`<h2>${inline(line.slice(3))}</h2>`);
    else if (line.startsWith("# ")) out.push(`<h2>${inline(line.slice(2))}</h2>`);
    else out.push(`<p>${inline(line)}</p>`);
  }
  flush();
  return out.join("");
}
