import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Turns the raw photo drops into web-ready assets.
 *
 *   node scripts/optimize-photos.mjs
 *
 * Sources arrive at 1664-2688px and 4-6 MB of PNG each — 44 MB in total, which
 * has no business sitting in a git repo. Each one is resized to the largest
 * size it is ever displayed at (x2 for retina) and re-encoded as WebP;
 * next/image then derives its own responsive variants from these.
 *
 * Re-run it whenever a new photo lands in `photos-src/`.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "photos-src");
const OUT = path.join(ROOT, "public/photos");

const JOBS = [
  { src: "01_hero.png", out: "hero-atelier", width: 2000 },
  // Image du haut de page : les mains posent un patron sur la table de coupe.
  { src: "01_hero_v2.png", out: "hero-pattern", width: 2000 },
  // Image à fournir (docs/IMAGES-A-FOURNIR.md) : ignorée tant qu'absente.
  { src: "10_pattern_garment.png", out: "pattern-garment", width: 1200 },
  { src: "02_problem.png", out: "problem-tape", width: 1200 },
  { src: "03_how_it_works_face.png", out: "step-front", width: 1200 },
  { src: "04_how_it_works_profile.png", out: "step-profile", width: 1200 },
  { src: "05_how_it_works_result_measurements.png", out: "step-result", width: 1200 },
  { src: "06_for_tailors.png", out: "for-tailors", width: 1800 },
  { src: "07_for_clients.png", out: "for-clients", width: 1200 },
  { src: "08_fabric_strip.png", out: "fabric-strip", width: 2400 },
  // The only one that keeps its alpha — it is cut out, not a photograph.
  { src: "09_avatar_3d.png", out: "avatar-3d", width: 1100, alpha: true },
];

fs.mkdirSync(OUT, { recursive: true });

let before = 0;
let after = 0;

for (const job of JOBS) {
  const src = path.join(SRC, job.src);
  if (!fs.existsSync(src)) {
    console.log(`  MISSING  ${job.src}`);
    continue;
  }

  const srcSize = fs.statSync(src).size;
  before += srcSize;

  let pipe = sharp(src).resize({ width: job.width, withoutEnlargement: true });

  // Only the avatar needs transparency; flattening the photographs onto white
  // drops a channel and keeps the encoder honest.
  if (!job.alpha) pipe = pipe.flatten({ background: "#ffffff" });

  const info = await pipe
    .webp({ quality: job.alpha ? 88 : 80, effort: 6 })
    .toFile(path.join(OUT, `${job.out}.webp`));

  after += info.size;
  console.log(
    `  ${job.out.padEnd(14)} ${String(info.width).padStart(4)}x${String(info.height).padEnd(4)}  ` +
      `${(srcSize / 1048576).toFixed(1)} MB -> ${(info.size / 1024).toFixed(0)} KB`,
  );
}

console.log(
  `\ntotal ${(before / 1048576).toFixed(1)} MB -> ${(after / 1048576).toFixed(2)} MB ` +
    `(${(100 - (after / before) * 100).toFixed(1)}% smaller)`,
);
