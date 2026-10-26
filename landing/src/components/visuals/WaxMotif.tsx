import { cn } from "@/lib/utils";

/**
 * Motif géométrique inspiré du wax (cercles concentriques, losanges), en
 * filigrane sur les fonds sombres. Il dérive très lentement (CSS
 * `.wax-drift`), et reste fixe si le téléphone demande moins d'animations.
 */
export function WaxMotif({ id, className }: { id: string; className?: string }) {
  return (
    <div aria-hidden className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}>
      <svg className="wax-drift absolute -inset-[20%] h-[140%] w-[140%]">
        <defs>
          <pattern id={id} width="120" height="120" patternUnits="userSpaceOnUse" patternTransform="rotate(12)">
            <g fill="none" stroke="currentColor" strokeWidth="1.2">
              <circle cx="60" cy="60" r="34" />
              <circle cx="60" cy="60" r="24" />
              <circle cx="60" cy="60" r="12" />
              <circle cx="60" cy="60" r="3" fill="currentColor" />
              <path d="M0 0 L20 20 M120 0 L100 20 M0 120 L20 100 M120 120 L100 100" />
              <path d="M60 0 L72 12 L60 24 L48 12 Z M60 96 L72 108 L60 120 L48 108 Z" />
              <path d="M0 60 L12 48 L24 60 L12 72 Z M96 60 L108 48 L120 60 L108 72 Z" />
            </g>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${id})`} />
      </svg>
    </div>
  );
}
