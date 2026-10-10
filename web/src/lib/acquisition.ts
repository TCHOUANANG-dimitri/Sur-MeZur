/**
 * Suivi de l'acquisition (B1.4 / 14.10).
 *
 * A la premiere visite, on lit les parametres `utm_*`, `ref` et `code` de
 * l'adresse ainsi que le chemin d'arrivee, et on les garde 30 jours en
 * localStorage. L'inscription les renvoie ensuite dans `acquisition`
 * (voir `readAcquisition()` utilise par /inscription).
 *
 * Tout acces au stockage est protege par `try/catch` : en navigation privee
 * ou avec un bloqueur, le suivi echoue silencieusement au lieu de casser
 * la page.
 */

const STORAGE_KEY = "smz_acquisition";
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export interface AcquisitionUtm {
  [key: string]: string | undefined;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
}

export interface AcquisitionPayload {
  source?: string;
  source_other?: string;
  utm?: AcquisitionUtm;
  referral_code?: string;
  landing_path?: string;
}

interface StoredAcquisition extends AcquisitionPayload {
  saved_at: number;
}

function readStored(): StoredAcquisition | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredAcquisition;
    if (!parsed || typeof parsed !== "object") return null;
    if (Date.now() - (parsed.saved_at ?? 0) > THIRTY_DAYS_MS) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/** Memorise l'origine de la visite, une seule fois (la premiere gagne). */
export function captureAcquisition(): void {
  try {
    if (readStored()) return;
    const params = new URLSearchParams(window.location.search);
    const utm: AcquisitionUtm = {};
    (["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const).forEach(
      (key) => {
        const value = params.get(key)?.trim();
        if (value) utm[key] = value;
      }
    );
    const referral = params.get("code")?.trim() || params.get("ref")?.trim() || undefined;
    if (Object.keys(utm).length === 0 && !referral) return;
    const stored: StoredAcquisition = {
      saved_at: Date.now(),
      landing_path: window.location.pathname,
      ...(Object.keys(utm).length > 0 ? { utm } : {}),
      ...(referral ? { referral_code: referral } : {}),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  } catch {
    /* suivi indisponible : on continue sans */
  }
}

/**
 * Origine a joindre a l'inscription (`POST /api/auth/register {acquisition}`).
 * Combine le code saisi ou present dans l'adresse (`overrideReferral`,
 * prioritaire) avec ce qui a ete capture a la premiere visite.
 */
export function readAcquisition(overrideReferral?: string): AcquisitionPayload | undefined {
  const stored = readStored();
  const referral = overrideReferral?.trim() || stored?.referral_code;
  const payload: AcquisitionPayload = {
    ...(stored?.utm ? { utm: stored.utm } : {}),
    ...(stored?.landing_path ? { landing_path: stored.landing_path } : {}),
    ...(referral ? { referral_code: referral } : {}),
  };
  return Object.keys(payload).length > 0 ? payload : undefined;
}
