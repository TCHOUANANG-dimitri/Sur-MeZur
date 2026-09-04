/**
 * Selection de modeles a coudre, conservee dans le navigateur.
 *
 * POURQUOI COTE NAVIGATEUR. La fiche de mesures doit partir avec un ou
 * plusieurs modeles choisis par la personne. Or rien cote serveur ne relie un
 * modele a une mesure tant qu'aucune commande n'existe : la table qui porte ce
 * lien est `orders`, et la version web ne passe pas de commande. Plutot que
 * d'inventer un schema de persistance pour un besoin qui ne survit pas a
 * l'edition de la fiche, la selection vit dans `localStorage`.
 *
 * Consequence assumee : elle est propre a l'appareil et au navigateur. Les
 * FAVORIS, eux, sont bien enregistres cote serveur (CatalogApi.like) et
 * suivent le compte partout — ce sont deux notions differentes, et l'interface
 * les presente comme telles.
 */

const KEY = "sm_model_selection";

function read(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    // Navigation privee, stockage desactive, valeur corrompue : une selection
    // vide est toujours preferable a une page qui ne s'affiche pas.
    return [];
  }
}

function write(ids: string[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(ids));
    // Previent les autres composants de la meme page ; l'evenement natif
    // `storage` ne se declenche que dans les AUTRES onglets.
    window.dispatchEvent(new CustomEvent("sm-selection"));
  } catch {
    /* stockage indisponible : la selection ne persistera pas, sans plus */
  }
}

export function getSelection(): string[] {
  return read();
}

export function isSelected(id: string): boolean {
  return read().includes(id);
}

export function addToSelection(id: string): void {
  const ids = read();
  if (!ids.includes(id)) write([...ids, id]);
}

export function removeFromSelection(id: string): void {
  write(read().filter((x) => x !== id));
}

export function clearSelection(): void {
  write([]);
}

/** S'abonne aux changements, y compris ceux venus d'un autre onglet. */
export function onSelectionChange(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("sm-selection", cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener("sm-selection", cb);
    window.removeEventListener("storage", cb);
  };
}
