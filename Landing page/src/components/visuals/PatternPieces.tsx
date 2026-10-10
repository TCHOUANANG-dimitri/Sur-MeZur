/**
 * Pièces de patron dessinées en SVG (devant, dos, manche) : marges de
 * couture en pointillé, droit-fil, crans. Le tracé se dessine à l'entrée de
 * la section (classe `.pattern-draw`, voir globals.css), sans bibliothèque.
 */
export function PatternPieces({
  labels,
  title,
}: {
  labels: { front: string; back: string; sleeve: string };
  title: string;
}) {
  return (
    <svg viewBox="0 0 420 340" className="pattern-draw h-auto w-full" role="img" aria-label={title}>
      <defs>
        <pattern id="pp-grid" width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M20 0H0V20" fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width="420" height="340" rx="18" fill="url(#pp-grid)" />

      {/* Devant */}
      <g transform="translate(22 26)">
        <path
          className="pp-cut"
          d="M30 0h62c4 14 14 22 30 22l20 6 10 54-14 6 6 70-8 112H18L8 158 14 88 0 82 10 28 30 22Z"
          fill="rgba(165,55,252,0.10)"
          stroke="#C9A8FF"
          strokeWidth="2"
        />
        <path
          className="pp-seam"
          d="M38 10h48c6 14 16 22 32 24l14 4 8 42-12 6 6 68-8 102H28L20 156 26 92 14 86 20 36 38 30Z"
          fill="none"
          stroke="#C9A8FF"
          strokeWidth="1"
          strokeDasharray="4 4"
        />
        <path d="M72 90v120" stroke="#fff" strokeOpacity=".6" strokeWidth="1.4" markerEnd="none" />
        <path d="M66 98l6-8 6 8M66 202l6 8 6-8" stroke="#fff" strokeOpacity=".6" fill="none" />
        <text x="44" y="150" fill="#fff" fontSize="13" fontWeight="600">{labels.front}</text>
      </g>

      {/* Dos */}
      <g transform="translate(176 26)">
        <path
          className="pp-cut"
          d="M24 0h70l10 16 22 10 10 56-14 6 6 70-8 112H18L8 158 14 88 0 82 10 26 24 16Z"
          fill="rgba(165,55,252,0.10)"
          stroke="#C9A8FF"
          strokeWidth="2"
        />
        <path
          className="pp-seam"
          d="M30 10h58l8 14 20 8 8 50-12 6 6 68-8 102H28L20 156 26 92 14 86 20 34 30 24Z"
          fill="none"
          stroke="#C9A8FF"
          strokeWidth="1"
          strokeDasharray="4 4"
        />
        <path d="M66 90v120" stroke="#fff" strokeOpacity=".6" strokeWidth="1.4" />
        <path d="M60 98l6-8 6 8M60 202l6 8 6-8" stroke="#fff" strokeOpacity=".6" fill="none" />
        <text x="50" y="150" fill="#fff" fontSize="13" fontWeight="600">{labels.back}</text>
      </g>

      {/* Manche */}
      <g transform="translate(320 46)">
        <path
          className="pp-cut"
          d="M40 0c22 0 38 20 46 44l-10 200H6L0 44C6 20 20 0 40 0Z"
          fill="rgba(165,55,252,0.10)"
          stroke="#C9A8FF"
          strokeWidth="2"
          transform="scale(0.88)"
        />
        <path d="M36 60v130" stroke="#fff" strokeOpacity=".6" strokeWidth="1.4" />
        <text x="12" y="128" fill="#fff" fontSize="12" fontWeight="600">{labels.sleeve}</text>
      </g>
    </svg>
  );
}
