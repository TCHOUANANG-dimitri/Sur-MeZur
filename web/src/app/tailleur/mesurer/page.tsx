"use client";

/**
 * Mesurer un client (B3.3) : par photo (parcours `MeasureFlow` branche sur
 * les routes tailleur, sans logique dupliquee) ou au metre ruban
 * (formulaire des 12 mesures). Le resultat est range dans le carnet.
 */

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { MeasureFlow } from "@/components/MeasureFlow";
import { Button, ErrorBanner, PageHeader, Spinner, Steps } from "@/components/ui";
import { TailorApi } from "@/lib/api/tailor";
import { ClientPicker, ManualMeasureForm } from "../_components";

function MesurerInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [clientId, setClientId] = useState(params.get("client") ?? "");
  const [mode, setMode] = useState<"photo" | "manuel" | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const sessionApi = useMemo(
    () =>
      clientId
        ? {
            createSession: (body: { height_cm: number; weight_kg?: number; gender?: string }) =>
              TailorApi.createMeasureSession(clientId, body),
            uploadPhotos: (sessionId: string, front: File, side: File) =>
              TailorApi.uploadMeasurePhotos(sessionId, front, side),
            getSession: (sessionId: string) => TailorApi.getMeasureSession(sessionId),
          }
        : undefined,
    [clientId]
  );

  async function saveManual(data: Record<string, number>, heightCm: number) {
    if (!clientId) return;
    setError("");
    setBusy(true);
    try {
      await TailorApi.addManualMeasurements(clientId, { data, height_cm: heightCm });
      router.replace(`/tailleur/clients/${clientId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Enregistrement impossible.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="tPage">
      <PageHeader title="Mesurer un client" back />
      <ErrorBanner message={error} />
      <Steps total={3} current={!clientId ? 1 : mode === null ? 2 : 3} />

      {!clientId || mode === null ? (
        <>
          <ClientPicker value={clientId} onChange={(id) => { setClientId(id); setMode(null); }} />
          {clientId && mode === null && (
            <div className="tBigButtons">
              <Button block onClick={() => setMode("photo")}>Par photo</Button>
              <Button block variant="secondary" onClick={() => setMode("manuel")}>Au mètre ruban</Button>
            </div>
          )}
        </>
      ) : mode === "manuel" ? (
        <>
          <Button variant="ghost" onClick={() => setMode(null)}>← Changer de méthode</Button>
          <ManualMeasureForm onSubmit={saveManual} busy={busy} submitLabel="Enregistrer dans le carnet" />
        </>
      ) : sessionApi ? (
        <>
          <div className="no-print">
            <Button variant="ghost" onClick={() => setMode(null)}>← Changer de méthode</Button>
          </div>
          <MeasureFlow sessionApi={sessionApi} onDone={() => router.replace(`/tailleur/clients/${clientId}`)} />
        </>
      ) : (
        <Spinner label="Chargement…" />
      )}
    </div>
  );
}

export default function MesurerClient() {
  return (
    <Suspense fallback={<Spinner label="Chargement…" />}>
      <MesurerInner />
    </Suspense>
  );
}
