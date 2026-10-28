import { cn } from "@/lib/utils";

/**
 * Motif Ndop, le tissu royal des Grassfields de l'Ouest du Cameroun :
 * réserves claires sur indigo, damiers barrés, losanges, zigzags, spirales.
 * C'est la signature visuelle de Sur-MeZur (le même carreau sert à
 * l'application, styles/globals.css `.ndop`). En filigrane sur les fonds
 * sombres ; il dérive très lentement (CSS `.wax-drift`) et reste fixe si le
 * téléphone demande moins d'animations. Couleur : `currentColor`.
 */
export function NdopMotif({ id, className, taille = 96 }: { id: string; className?: string; taille?: number }) {
  return (
    <div aria-hidden className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}>
      <svg className="wax-drift absolute -inset-[20%] h-[140%] w-[140%]">
        <defs>
          <pattern id={id} width={taille} height={taille} patternUnits="userSpaceOnUse" viewBox="0 0 96 96">
            <NdopCarreau />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${id})`} />
      </svg>
    </div>
  );
}

/** Le carreau de 96 × 96, en `currentColor`. */
export function NdopCarreau() {
  return (
    <>
      <g fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
        <rect x="4" y="4" width="40" height="40" />
        <path d="M4 4 44 44M44 4 4 44" />
        <circle cx="24" cy="24" r="5" />
        <rect x="52" y="52" width="40" height="40" />
        <path d="M72 56 88 72 72 88 56 72Z" />
        <path d="M52 14l8-8 8 8 8-8 8 8 8-8M52 34l8-8 8 8 8-8 8 8 8-8" />
        <path d="M14 62a6 6 0 1 1 6 6 10 10 0 1 1-10-10M14 82h20" />
      </g>
      <g fill="currentColor">
        <circle cx="72" cy="72" r="3" />
        <circle cx="12" cy="88" r="2" />
        <circle cx="36" cy="88" r="2" />
      </g>
    </>
  );
}
