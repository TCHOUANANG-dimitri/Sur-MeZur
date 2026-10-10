import fs from "node:fs";
import path from "node:path";

/**
 * Images facultatives : la page s'affiche sans elles (avec une illustration
 * de remplacement) et les utilise dès qu'elles sont déposées dans `public/`.
 * Vérifié au moment de la construction du site : déposer un fichier, puis
 * relancer `npm run build` (ou redéployer) suffit, sans toucher au code.
 * Liste et formats attendus : docs/IMAGES-A-FOURNIR.md.
 */
export function publicFile(relative: string): string | null {
  const clean = relative.replace(/^\/+/, "");
  return fs.existsSync(path.join(process.cwd(), "public", clean)) ? `/${clean}` : null;
}
