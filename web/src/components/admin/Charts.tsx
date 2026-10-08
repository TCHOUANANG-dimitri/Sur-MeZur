"use client";

/**
 * Graphiques SVG sans dependance (1.4, M14) : courbes, barres, barres
 * horizontales. Le SVG s'adapte a la largeur de son conteneur (viewBox).
 */

import React from "react";
import { formatNumber, formatPeriod } from "./format";

export const PALETTE = ["#7c3aed", "#0ea5e9", "#f59e0b", "#10b981", "#ef4444", "#64748b"];

export interface Serie {
  label: string;
  values: number[];
  color?: string;
}

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

export function LineChart({
  labels,
  series,
  granularity = "day",
  height = 220,
  bars = false,
  format = (v: number) => formatNumber(v),
}: {
  labels: string[];
  series: Serie[];
  granularity?: string;
  height?: number;
  /** Barres empilees au lieu de courbes. */
  bars?: boolean;
  format?: (v: number) => string;
}) {
  const W = 640;
  const H = height;
  const pad = { l: 44, r: 10, t: 10, b: 24 };
  const n = labels.length;
  const totals = labels.map((_, i) => (bars ? series.reduce((a, s) => a + (s.values[i] ?? 0), 0) : Math.max(...series.map((s) => s.values[i] ?? 0))));
  const max = niceMax(Math.max(0, ...totals));
  const x = (i: number) => pad.l + (n <= 1 ? (W - pad.l - pad.r) / 2 : (i * (W - pad.l - pad.r)) / (n - 1));
  const y = (v: number) => H - pad.b - (v / max) * (H - pad.t - pad.b);
  const step = Math.max(1, Math.ceil(n / 8));
  const bw = Math.max(2, ((W - pad.l - pad.r) / Math.max(n, 1)) * 0.7);
  const empty = totals.every((t) => t === 0);

  return (
    <div>
      <svg className="adChart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={series.map((s) => s.label).join(", ")}>
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <line className="adChartGrid" x1={pad.l} x2={W - pad.r} y1={y(max * f)} y2={y(max * f)} />
            <text x={pad.l - 6} y={y(max * f) + 3} textAnchor="end">
              {format(max * f)}
            </text>
          </g>
        ))}
        {labels.map((l, i) =>
          i % step === 0 ? (
            <text key={l + i} x={x(i)} y={H - 6} textAnchor="middle">
              {formatPeriod(l, granularity)}
            </text>
          ) : null
        )}
        {bars
          ? labels.map((l, i) => {
              let acc = 0;
              return (
                <g key={l + i}>
                  {series.map((s, si) => {
                    const v = s.values[i] ?? 0;
                    const y0 = y(acc);
                    acc += v;
                    const y1 = y(acc);
                    return (
                      <rect key={si} x={x(i) - bw / 2} width={bw} y={y1} height={Math.max(0, y0 - y1)} fill={s.color ?? PALETTE[si % PALETTE.length]} rx={2}>
                        <title>{`${s.label} — ${formatPeriod(l, granularity)} : ${format(v)}`}</title>
                      </rect>
                    );
                  })}
                </g>
              );
            })
          : series.map((s, si) => {
              const color = s.color ?? PALETTE[si % PALETTE.length];
              const d = s.values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v ?? 0).toFixed(1)}`).join(" ");
              return (
                <g key={si}>
                  <path d={d} fill="none" stroke={color} strokeWidth={2.2} strokeLinejoin="round" />
                  {s.values.map((v, i) => (
                    <circle key={i} cx={x(i)} cy={y(v ?? 0)} r={n > 40 ? 0 : 2.6} fill={color}>
                      <title>{`${s.label} — ${formatPeriod(labels[i], granularity)} : ${format(v ?? 0)}`}</title>
                    </circle>
                  ))}
                </g>
              );
            })}
        {empty && (
          <text x={W / 2} y={H / 2} textAnchor="middle" style={{ fontSize: 13 }}>
            Pas encore de données sur la période
          </text>
        )}
      </svg>
      {series.length > 1 && (
        <div className="adLegend">
          {series.map((s, si) => (
            <span key={s.label}>
              <i style={{ background: s.color ?? PALETTE[si % PALETTE.length] }} />
              {s.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function HBars({
  rows,
  format = (v: number) => formatNumber(v),
}: {
  rows: { label: string; value: number; hint?: string }[];
  format?: (v: number) => string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <p className="adHint">Aucune donnée.</p>;
  return (
    <div>
      {rows.map((r) => (
        <div key={r.label} className="adHBar" title={r.hint}>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.label}</span>
          <div className="adHBarTrack">
            <span style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
          <strong>{format(r.value)}</strong>
        </div>
      ))}
    </div>
  );
}

/** Entonnoir : chaque etape en barre, avec le taux de passage. */
export function Funnel({ steps }: { steps: { label: string; value: number }[] }) {
  const max = Math.max(1, ...steps.map((s) => s.value));
  return (
    <div>
      {steps.map((s, i) => {
        const prev = i > 0 ? steps[i - 1].value : null;
        const rate = prev ? Math.round((s.value / prev) * 1000) / 10 : null;
        return (
          <div key={s.label} className="adHBar">
            <span>{s.label}</span>
            <div className="adHBarTrack">
              <span style={{ width: `${(s.value / max) * 100}%` }} />
            </div>
            <strong>
              {formatNumber(s.value)}
              {rate != null && <span className="adHint"> ({formatNumber(rate, 1)} %)</span>}
            </strong>
          </div>
        );
      })}
    </div>
  );
}
