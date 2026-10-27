/**
 * Icônes dessinées pour Sur-MeZur (navigation et principaux repères).
 *
 * Même grille et même trait que Lucide (24 × 24, trait arrondi), pour cohabiter
 * avec les autres icônes de l'application, mais avec une signature à nous :
 * un point de couture en pointillé et la pointe d'aiguille, dans la couleur
 * d'accent (`--icon-accent`, violet). L'onglet actif remplit la forme
 * principale (`--icon-fill`, voir styles/shell.css).
 *
 * Mêmes propriétés que les icônes Lucide (`size`, `strokeWidth`,
 * `className`) : elles se remplacent l'une l'autre sans rien changer ailleurs.
 */

import type { SVGProps } from "react";

type IconProps = Omit<SVGProps<SVGSVGElement>, "ref"> & { size?: number | string; strokeWidth?: number | string };

const ACCENT = { stroke: "var(--icon-accent, var(--violet-vivid))" } as const;
const REMPLI = { fill: "var(--icon-fill, none)" } as const;

function Base({ size = 24, strokeWidth = 1.8, children, ...rest }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...rest}
    >
      {children}
    </svg>
  );
}

/** Accueil : l'atelier, la couture du toit en pointillé. */
export function IconAtelier(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M3.5 10.6 12 3.9l8.5 6.7v9.6H3.5Z" style={REMPLI} />
      <path d="M9.5 20.2v-4.6a2.5 2.5 0 0 1 5 0v4.6" />
      <path d="M6.8 10.4 12 6.3l5.2 4.1" style={ACCENT} strokeDasharray="1.4 2.1" />
    </Base>
  );
}

/** Modèles : le mannequin de couture, la ligne de taille cousue. */
export function IconMannequin(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="12" cy="3.3" r="1.3" />
      <path d="M8 5.9c1.6-.6 6.4-.6 8 0 .8 2.6-.4 4.7.2 7.1.6 2.6-1.2 4-4.2 4s-4.8-1.4-4.2-4c.6-2.4-.6-4.5.2-7.1Z" style={REMPLI} />
      <path d="M12 17v3.8M9 21h6" />
      <path d="M8.7 11.2h6.6" style={ACCENT} strokeDasharray="1.4 1.9" />
    </Base>
  );
}

/** Tailleurs : les ciseaux, et le fil qui part du pivot. */
export function IconCiseaux(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="6.6" cy="17.4" r="2.7" style={REMPLI} />
      <circle cx="17.4" cy="17.4" r="2.7" style={REMPLI} />
      <path d="M8.5 15.5 18 4.4M15.5 15.5 6 4.4" />
      <path d="M12 11c2.6-2.3 6.4-2 8.6.6" style={ACCENT} strokeDasharray="1.4 1.9" />
      <circle cx="12" cy="11" r="1" style={{ fill: "var(--icon-accent, var(--violet-vivid))", stroke: "none" }} />
    </Base>
  );
}

/** Mesures : le mètre ruban enroulé, ses graduations. */
export function IconRuban(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="9" cy="11" r="6.2" style={REMPLI} />
      <circle cx="9" cy="11" r="2" />
      <path d="M14 14.6h7v2.6H9" />
      <path d="M12.6 17.2v-1.4M15.6 17.2v-1.7M18.6 17.2v-1.4" style={ACCENT} />
    </Base>
  );
}

/** Profil : le buste à col, la patte de boutonnage cousue. */
export function IconBuste(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="12" cy="7.3" r="3.5" style={REMPLI} />
      <path d="M4.5 20.5c.5-4.2 3.5-6.3 7.5-6.3s7 2.1 7.5 6.3" style={REMPLI} />
      <path d="m9.6 14.6 2.4 2.8 2.4-2.8" />
      <path d="M12 17.4v3.1" style={ACCENT} strokeDasharray="1.2 1.7" />
    </Base>
  );
}

/** Clients du tailleur : le carnet, sa reliure cousue. */
export function IconCarnet(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M6 3.5h11.5A1.5 1.5 0 0 1 19 5v14a1.5 1.5 0 0 1-1.5 1.5H6Z" style={REMPLI} />
      <path d="M8.3 3.5v17" style={ACCENT} strokeDasharray="1.4 1.8" />
      <circle cx="13.4" cy="9.6" r="2" />
      <path d="M10.4 15.6c.6-2 5.4-2 6 0" />
    </Base>
  );
}

/** Travaux : la bobine de fil et l'aiguille. */
export function IconBobine(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M5 4h9M5 20h9" />
      <path d="M6.6 4v16h5.8V4" style={REMPLI} />
      <path d="M6.6 8.5l5.8 2M6.6 12.5l5.8 2" style={ACCENT} strokeDasharray="1.3 1.6" />
      <path d="M17.5 3.5 19.6 20" />
      <ellipse cx="17.8" cy="5.4" rx=".5" ry="1.1" transform="rotate(-7 17.8 5.4)" style={ACCENT} />
    </Base>
  );
}

/** Patrons : une pièce de patron, ses crans et son droit-fil. */
export function IconPiece(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M5 3.5h8.2L19 9.3v11.2H5Z" style={REMPLI} />
      <path d="M13.2 3.5v5.8H19" />
      <path d="m8.6 20.5 1.2-1.6 1.2 1.6M5 12.6l1.6 1.2L5 15" style={ACCENT} />
      <path d="M12 11.6v6" style={ACCENT} strokeDasharray="1.3 1.6" />
    </Base>
  );
}
