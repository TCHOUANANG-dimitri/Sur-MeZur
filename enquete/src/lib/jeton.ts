/**
 * Jeton d'acces garde sur l'appareil : le tailleur qui revient par
 * l'adresse du site retrouve ses fiches. Stockage parfois indisponible
 * (navigation privee) : on ne fait alors simplement rien.
 */

const CLE = "smz_enquete_jeton";

export function jetonMemorise(): string | null {
  try {
    return localStorage.getItem(CLE);
  } catch {
    return null;
  }
}

export function memoriserJeton(token: string): void {
  try {
    localStorage.setItem(CLE, token);
  } catch {
    /* stockage indisponible */
  }
}

export function oublierJeton(): void {
  try {
    localStorage.removeItem(CLE);
  } catch {
    /* stockage indisponible */
  }
}
