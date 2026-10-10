"use client";

/**
 * Suivi de l'acquisition (B1.4) : monte une fois dans `app/layout.tsx` et
 * memorise a la premiere visite les parametres `utm_*`, `ref` et `code`.
 * Ne rend rien.
 */

import { useEffect } from "react";
import { captureAcquisition } from "@/lib/acquisition";

export function AcquisitionTracker() {
  useEffect(() => {
    captureAcquisition();
  }, []);
  return null;
}
