/**
 * Briques des ecrans de profil (client et tailleur), styles dans
 * styles/profile.css : compteur, section de reglages, ligne de reglage.
 */

import Link from "next/link";
import { IconChevronRight } from "./icons";

type Icon = React.ComponentType<{ size?: number; strokeWidth?: number }>;

export function ProfileStat({ value, label, Icon }: { value: number; label: string; Icon: Icon }) {
  return (
    <div className="profileStat">
      <span className="profileStatIcon" aria-hidden>
        <Icon size={18} strokeWidth={1.9} />
      </span>
      <span className="profileStatValue">{value}</span>
      <span className="profileStatLabel">{label}</span>
    </div>
  );
}

export function SettingsSection({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section className="settingsSection">
      {title && <h2 className="settingsTitle">{title}</h2>}
      <div className="settingsCard">{children}</div>
    </section>
  );
}

export function SettingsRow({
  Icon,
  label,
  value,
  hint,
  href,
  onClick,
  danger,
  last,
}: {
  Icon: Icon;
  label: string;
  value?: string;
  hint?: string;
  href?: string;
  onClick?: () => void;
  danger?: boolean;
  last?: boolean;
}) {
  const inner = (
    <>
      <span className={`settingsIcon ${danger ? "settingsIconDanger" : ""}`} aria-hidden>
        <Icon size={18} strokeWidth={1.9} />
      </span>
      <span className="settingsLabelWrap">
        <span className="settingsLabel">{label}</span>
        {hint && <span className="fieldHint">{hint}</span>}
      </span>
      {value && <span className="settingsValue">{value}</span>}
      {href && <IconChevronRight size={18} aria-hidden />}
    </>
  );

  const className = `settingsRow ${last ? "" : "settingsRowDivided"} ${danger ? "settingsRowDanger" : ""}`;

  if (href) {
    return (
      <Link href={href} className={className}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" className={className} onClick={onClick}>
      {inner}
    </button>
  );
}
