"use client";

/**
 * Kit d'interface partage. Volontairement minimal : chaque composant n'est
 * qu'un habillage typé autour des classes de `src/styles/ui.css`, pour que
 * le responsive vive dans la feuille de style (ou les media queries sont
 * possibles) et non dans des objets `style={{...}}` (ou elles ne le sont pas).
 */

import React from "react";
import { useRouter } from "next/navigation";

type Variant = "primary" | "secondary" | "ghost" | "danger";

export function Button({
  variant = "primary",
  block,
  className = "",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; block?: boolean }) {
  const map: Record<Variant, string> = {
    primary: "btnPrimary",
    secondary: "btnSecondary",
    ghost: "btnGhost",
    danger: "btnDanger",
  };
  return (
    <button
      {...rest}
      className={`btn ${map[variant]} ${block ? "btnBlock" : ""} ${className}`.trim()}
    />
  );
}

export function Card({
  variant = "default",
  className = "",
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & { variant?: "default" | "elevated" | "flat" }) {
  const map = { default: "", elevated: "cardElevated", flat: "cardFlat" };
  return <div {...rest} className={`card ${map[variant]} ${className}`.trim()} />;
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="field">
      <span className="fieldLabel">{label}</span>
      {children}
      {hint && <span className="fieldHint">{hint}</span>}
    </label>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`input ${props.className ?? ""}`.trim()} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`input ${props.className ?? ""}`.trim()} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`input ${props.className ?? ""}`.trim()} />;
}

export function Chip({
  active,
  className = "",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return <button {...rest} className={`chip ${active ? "chipActive" : ""} ${className}`.trim()} />;
}

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: "success" | "pending" | "error" | "neutral";
  children: React.ReactNode;
}) {
  const map = {
    success: "badgeSuccess",
    pending: "badgePending",
    error: "badgeError",
    neutral: "badgeNeutral",
  };
  return <span className={`badge ${map[tone]}`}>{children}</span>;
}

export function ErrorBanner({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div className="banner bannerError" role="alert">
      <span aria-hidden>⚠️</span>
      <span>{message}</span>
    </div>
  );
}

export function InfoBanner({ children }: { children: React.ReactNode }) {
  return <div className="banner bannerInfo">{children}</div>;
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="center">
      <div className="spinner" role="status" aria-label={label ?? "Chargement"} />
      {label && <p className="muted">{label}</p>}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon?: string;
  title: string;
  body?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="center">
      {icon && <div style={{ fontSize: 34 }} aria-hidden>{icon}</div>}
      <h3>{title}</h3>
      {body && <p className="muted" style={{ maxWidth: 420 }}>{body}</p>}
      {action}
    </div>
  );
}

export function PageHeader({
  title,
  back,
  action,
}: {
  title: string;
  back?: boolean;
  action?: React.ReactNode;
}) {
  const router = useRouter();
  return (
    <header className="header no-print">
      {back && (
        <button className="backBtn" onClick={() => router.back()} aria-label="Retour">
          ←
        </button>
      )}
      <h1 className="headerTitle">{title}</h1>
      {action}
    </header>
  );
}

/** Fil de progression d'un parcours en plusieurs etapes. */
export function Steps({ total, current }: { total: number; current: number }) {
  return (
    <div className="steps" role="progressbar" aria-valuemin={1} aria-valuemax={total} aria-valuenow={current}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={`stepDot ${i < current ? "stepDotDone" : ""}`} />
      ))}
    </div>
  );
}
