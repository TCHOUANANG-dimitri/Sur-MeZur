import { cn } from "@/lib/utils";

/**
 * Séparation en mètre ruban : graduations au centimètre, chiffres tous les
 * 10 cm, qui défilent doucement (CSS `.tape-run`). Deux longueurs identiques
 * bout à bout : le défilement boucle sans saut.
 */
const CM = 12; // pixels par centimètre
const LONGUEUR = 200; // cm par moitié (2 400 px : plus large que les grands écrans)

function Ruban({ offset }: { offset: number }) {
  const nombres = [];
  for (let cm = 10; cm <= LONGUEUR; cm += 10) nombres.push(cm);
  return (
    <g transform={`translate(${offset * LONGUEUR * CM} 0)`}>
      <rect width={LONGUEUR * CM} height="34" fill="url(#tape-ticks)" />
      {nombres.map((cm) => (
        <text key={cm} x={cm * CM - 3} y="27" textAnchor="end" fontSize="10" fontWeight="600" fill="#08044D" fillOpacity="0.75">
          {cm}
        </text>
      ))}
    </g>
  );
}

export function TapeMeasure({ className, tilt = -0.7 }: { className?: string; tilt?: number }) {
  const largeur = LONGUEUR * CM;
  return (
    <div aria-hidden className={cn("pointer-events-none relative z-10 -my-[17px] overflow-hidden", className)} style={{ transform: `rotate(${tilt}deg)` }}>
      <div className="h-[34px] w-[200vw] bg-[#F3E9D3] shadow-[0_6px_18px_rgba(8,4,77,0.12)] ring-1 ring-[#08044D]/10">
        <svg className="tape-run block h-[34px]" width={largeur * 2} height="34" fontFamily="var(--font-jost), Jost, sans-serif">
          <defs>
            <pattern id="tape-ticks" width={CM * 10} height="34" patternUnits="userSpaceOnUse">
              <g stroke="#08044D" strokeOpacity="0.6" strokeWidth="1">
                {Array.from({ length: 10 }, (_, i) => (
                  <line key={i} x1={i * CM + 0.5} x2={i * CM + 0.5} y1="0" y2={i === 0 ? 16 : i === 5 ? 11 : 7} />
                ))}
              </g>
            </pattern>
          </defs>
          <Ruban offset={0} />
          <Ruban offset={1} />
        </svg>
      </div>
    </div>
  );
}
