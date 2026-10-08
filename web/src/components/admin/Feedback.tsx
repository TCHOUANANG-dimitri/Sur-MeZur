"use client";

/**
 * Dialogues de confirmation et notifications de l'administration (0.8).
 *
 * `confirm()` renvoie une promesse : `null` si l'administrateur annule, sinon
 * le motif saisi (chaine vide si aucun motif n'est demande). Les actions
 * graves l'utilisent ; un motif est obligatoire quand il est communique a
 * l'utilisateur. `toast()` affiche un message court, avec un bouton
 * « Annuler » pour les actions reversibles.
 */

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui";

interface ConfirmOptions {
  title: string;
  body?: React.ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  /** Demande un motif. `required` : impossible de confirmer sans. */
  reason?: { label: string; required?: boolean; placeholder?: string; initial?: string };
}

interface ToastOptions {
  undo?: () => void | Promise<void>;
  error?: boolean;
}

interface FeedbackState {
  confirm: (o: ConfirmOptions) => Promise<string | null>;
  toast: (message: string, o?: ToastOptions) => void;
}

const Ctx = createContext<FeedbackState>({
  confirm: async () => null,
  toast: () => {},
});

interface ToastItem {
  id: number;
  message: string;
  undo?: () => void | Promise<void>;
  error?: boolean;
}

export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  const [dialog, setDialog] = useState<(ConfirmOptions & { resolve: (v: string | null) => void }) | null>(null);
  const [reason, setReason] = useState("");
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const seq = useRef(0);

  const confirm = useCallback((o: ConfirmOptions) => {
    setReason(o.reason?.initial ?? "");
    return new Promise<string | null>((resolve) => setDialog({ ...o, resolve }));
  }, []);

  const toast = useCallback((message: string, o: ToastOptions = {}) => {
    seq.current += 1;
    const id = seq.current;
    setToasts((t) => [...t, { id, message, undo: o.undo, error: o.error }]);
    // Le bouton « Annuler » reste quelques secondes (0.8).
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), o.undo ? 8000 : 4500);
  }, []);

  const close = (value: string | null) => {
    dialog?.resolve(value);
    setDialog(null);
  };

  useEffect(() => {
    if (!dialog) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const reasonMissing = Boolean(dialog?.reason?.required && reason.trim().length < 3);

  return (
    <Ctx.Provider value={{ confirm, toast }}>
      {children}
      {dialog && (
        <div className="adModalBackdrop" role="presentation" onClick={() => close(null)}>
          <div
            className="adModal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ad-confirm-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="ad-confirm-title">{dialog.title}</h2>
            {dialog.body && <div className="adMuted" style={{ fontSize: 14 }}>{dialog.body}</div>}
            {dialog.reason && (
              <label className="adFilter" style={{ marginTop: 12 }}>
                <span>
                  {dialog.reason.label}
                  {dialog.reason.required ? " (obligatoire)" : ""}
                </span>
                <textarea
                  className="input adTextarea"
                  autoFocus
                  value={reason}
                  placeholder={dialog.reason.placeholder}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
            )}
            <div className="adModalActions">
              <Button variant="secondary" onClick={() => close(null)}>
                Annuler
              </Button>
              <Button
                variant={dialog.danger ? "danger" : "primary"}
                disabled={reasonMissing}
                autoFocus={!dialog.reason}
                onClick={() => close(reason.trim())}
              >
                {dialog.confirmLabel ?? "Confirmer"}
              </Button>
            </div>
          </div>
        </div>
      )}
      <div className="adToasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`adToast ${t.error ? "adToastError" : ""}`} role="status">
            <span>{t.message}</span>
            {t.undo && (
              <button
                onClick={async () => {
                  setToasts((all) => all.filter((x) => x.id !== t.id));
                  await t.undo?.();
                }}
              >
                Annuler
              </button>
            )}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useFeedback() {
  return useContext(Ctx);
}

/** Fenetre modale simple, fermee par Echap ou un clic en dehors. */
export function Modal({
  title,
  onClose,
  children,
  wide,
  actions,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
  actions?: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="adModalBackdrop" role="presentation" onClick={onClose}>
      <div
        className={`adModal ${wide ? "adModalWide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <h2>{title}</h2>
        {children}
        {actions && <div className="adModalActions">{actions}</div>}
      </div>
    </div>
  );
}
