/**
 * Generateur de QR minimaliste (mode octet, correction L, versions 1 a 10),
 * sans dependance : sert a afficher le QR d'activation de la double
 * authentification dans l'administration.
 *
 * Implemente l'algorithme standard : encodage, Reed-Solomon sur GF(256),
 * entrelacement, placement (mires, rythme, alignement, module sombre),
 * informations de format et de version (BCH), choix du meilleur masque
 * (les 4 regles de penalite). Suffisant pour une URI otpauth (~100
 * caracteres) ; au-dela de la version 10, une erreur est levee.
 */

const ECC_LEVEL_BITS = 0b01; // L

// Octets de donnees utiles par version, mode octet, correction L.
const DATA_CAPACITY = [17, 32, 53, 78, 106, 134, 154, 192, 230, 271];

// Blocs correcteurs : [nombre de blocs, octets de donnees par bloc, octets ECC].
const ECC_TABLE: [number, number, number][][] = [
  [[1, 19, 7]],
  [[1, 34, 10]],
  [[1, 55, 15]],
  [[1, 80, 20]],
  [[1, 108, 26]],
  [[2, 68, 18]],
  [[2, 78, 20]],
  [[2, 97, 24]],
  [[2, 116, 30]],
  [[2, 68, 18], [4, 69, 18]],
];

// Centres des mires d'alignement par version.
const ALIGN: number[][] = [
  [],
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46],
  [6, 28, 50],
];

// --- Arithmetique GF(256) ----------------------------------------------------

const EXP = new Array(512);
const LOG = new Array(256);
(function initTables() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();

function gfMul(a: number, b: number): number {
  return a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]];
}

// Polynome generateur Reed-Solomon de degre `deg`.
function rsGenerator(deg: number): number[] {
  let poly = [1];
  for (let i = 0; i < deg; i++) {
    const next = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= gfMul(poly[j], EXP[i]);
      next[j + 1] ^= poly[j];
    }
    poly = next;
  }
  return poly;
}

function rsRemainder(data: number[], gen: number[]): number[] {
  const res = [...data, ...new Array(gen.length - 1).fill(0)];
  for (let i = 0; i < data.length; i++) {
    const coef = res[i];
    if (coef === 0) continue;
    for (let j = 0; j < gen.length; j++) res[i + j] ^= gfMul(gen[j], coef);
  }
  return res.slice(data.length);
}

// --- Bits --------------------------------------------------------------------

class BitBuffer {
  bits: number[] = [];
  put(value: number, length: number) {
    for (let i = length - 1; i >= 0; i--) this.bits.push((value >>> i) & 1);
  }
  bytes(): number[] {
    const out: number[] = [];
    for (let i = 0; i < this.bits.length; i += 8) {
      let b = 0;
      for (let j = 0; j < 8; j++) b = (b << 1) | (this.bits[i + j] ?? 0);
      out.push(b);
    }
    return out;
  }
}

function bitLength(n: number): number {
  return n === 0 ? 0 : Math.floor(Math.log2(n)) + 1;
}

// Reste BCH : `data` (dataLen bits) complete a totalLen bits via `poly`.
function bchEncode(data: number, dataLen: number, totalLen: number, poly: number): number {
  const shift = totalLen - dataLen;
  let rem = data << shift;
  const plen = bitLength(poly);
  while (bitLength(rem) >= plen) rem ^= poly << (bitLength(rem) - plen);
  return (data << shift) | rem;
}

// --- Matrice -----------------------------------------------------------------

type Matrix = { size: number; modules: boolean[][]; reserved: boolean[][] };

function emptyMatrix(version: number): Matrix {
  const size = 21 + 4 * (version - 1);
  return {
    size,
    modules: Array.from({ length: size }, () => new Array(size).fill(false)),
    reserved: Array.from({ length: size }, () => new Array(size).fill(false)),
  };
}

function setModule(m: Matrix, x: number, y: number, dark: boolean, reserved = true) {
  if (x < 0 || y < 0 || x >= m.size || y >= m.size) return;
  m.modules[y][x] = dark;
  if (reserved) m.reserved[y][x] = true;
}

function finder(m: Matrix, cx: number, cy: number) {
  for (let dy = -1; dy <= 7; dy++) {
    for (let dx = -1; dx <= 7; dx++) {
      const x = cx + dx;
      const y = cy + dy;
      if (x < 0 || y < 0 || x >= m.size || y >= m.size) continue;
      const dark = dx === -1 || dx === 7 || dy === -1 || dy === 7 ? false : dx === 0 || dx === 6 || dy === 0 || dy === 6 ? true : dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4;
      setModule(m, x, y, dark);
    }
  }
}

function buildFunctionPatterns(version: number): Matrix {
  const m = emptyMatrix(version);
  const n = m.size;
  finder(m, 0, 0);
  finder(m, n - 7, 0);
  finder(m, 0, n - 7);
  // Rythme.
  for (let i = 8; i < n - 8; i++) {
    setModule(m, i, 6, i % 2 === 0);
    setModule(m, 6, i, i % 2 === 0);
  }
  // Alignement.
  const pos = ALIGN[version - 1];
  for (const y of pos) {
    for (const x of pos) {
      const nearFinder = (x < 8 && y < 8) || (x < 8 && y >= n - 8) || (x >= n - 8 && y < 8);
      if (nearFinder) continue;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          setModule(m, x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
        }
      }
    }
  }
  // Module sombre.
  setModule(m, 8, 4 * version + 9, true);
  return m;
}

function writeFormat(m: Matrix, mask: number) {
  const bits = bchEncode((ECC_LEVEL_BITS << 3) | mask, 5, 15, 0x537) ^ 0x5412;
  const n = m.size;
  for (let i = 0; i < 6; i++) setModule(m, 8, i, ((bits >>> i) & 1) === 1);
  setModule(m, 8, 7, ((bits >>> 6) & 1) === 1);
  setModule(m, 8, 8, ((bits >>> 7) & 1) === 1);
  setModule(m, 7, 8, ((bits >>> 8) & 1) === 1);
  for (let i = 9; i < 15; i++) setModule(m, 14 - i, 8, ((bits >>> i) & 1) === 1);
  for (let i = 0; i < 8; i++) setModule(m, n - 1 - i, 8, ((bits >>> i) & 1) === 1);
  for (let i = 8; i < 15; i++) setModule(m, 8, n - 15 + i, ((bits >>> i) & 1) === 1);
  setModule(m, n - 8, 8, true); // module sombre recouvert, toujours noir
}

function writeVersion(m: Matrix, version: number) {
  if (version < 7) return;
  const bits = bchEncode(version, 6, 18, 0x1f25);
  const n = m.size;
  for (let i = 0; i < 18; i++) {
    const dark = ((bits >>> i) & 1) === 1;
    setModule(m, (i / 3) | 0, (i % 3) + n - 11, dark);
    setModule(m, (i % 3) + n - 11, (i / 3) | 0, dark);
  }
}

function maskApplies(pattern: number, x: number, y: number): boolean {
  switch (pattern) {
    case 0: return (x + y) % 2 === 0;
    case 1: return y % 2 === 0;
    case 2: return x % 3 === 0;
    case 3: return (x + y) % 3 === 0;
    case 4: return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
    case 5: return ((x * y) % 2) + ((x * y) % 3) === 0;
    case 6: return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
    default: return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
  }
}

function placeData(m: Matrix, codewords: number[]) {
  const bits: number[] = [];
  for (const cw of codewords) for (let i = 7; i >= 0; i--) bits.push((cw >>> i) & 1);
  let bit = 0;
  const n = m.size;
  for (let right = n - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5; // colonne de rythme
    for (let vert = 0; vert < n; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? n - 1 - vert : vert;
        if (!m.reserved[y][x] && bit < bits.length) {
          m.modules[y][x] = bits[bit] === 1;
          bit++;
        }
      }
    }
  }
}

function applyMask(m: Matrix, pattern: number) {
  for (let y = 0; y < m.size; y++) {
    for (let x = 0; x < m.size; x++) {
      if (!m.reserved[y][x] && maskApplies(pattern, x, y)) m.modules[y][x] = !m.modules[y][x];
    }
  }
}

// Les 4 regles de penalite du standard.
function penalty(m: Matrix): number {
  const n = m.size;
  let score = 0;
  const line = (cells: boolean[]) => {
    let run = 1;
    for (let i = 1; i <= cells.length; i++) {
      if (i < cells.length && cells[i] === cells[i - 1]) {
        run++;
      } else {
        if (run >= 5) score += 3 + (run - 5);
        run = 1;
      }
    }
  };
  for (let y = 0; y < n; y++) line(m.modules[y]);
  for (let x = 0; x < n; x++) line(m.modules.map((row) => row[x]));
  for (let y = 0; y < n - 1; y++) {
    for (let x = 0; x < n - 1; x++) {
      const v = m.modules[y][x];
      if (m.modules[y][x + 1] === v && m.modules[y + 1][x] === v && m.modules[y + 1][x + 1] === v) score += 3;
    }
  }
  const pat1 = [true, false, true, true, true, false, true, false, false, false, false];
  const pat2 = [false, false, false, false, true, false, true, true, true, false, true];
  const matches = (cells: boolean[]) => {
    for (let i = 0; i + 11 <= cells.length; i++) {
      const w = cells.slice(i, i + 11);
      if (w.every((v, k) => v === pat1[k]) || w.every((v, k) => v === pat2[k])) score += 40;
    }
  };
  for (let y = 0; y < n; y++) matches(m.modules[y]);
  for (let x = 0; x < n; x++) matches(m.modules.map((row) => row[x]));
  let dark = 0;
  for (const row of m.modules) for (const v of row) if (v) dark++;
  const pct = (dark * 20) / (n * n);
  score += Math.abs(Math.round(pct - 10)) * 10;
  return score;
}

// --- API ---------------------------------------------------------------------

export interface QrCode {
  version: number;
  size: number;
  modules: boolean[][];
}

/** Encode `text` (octets UTF-8) en matrice QR. */
export function encodeQr(text: string): QrCode {
  const bytes = Array.from(new TextEncoder().encode(text));
  const version = DATA_CAPACITY.findIndex((cap) => bytes.length <= cap) + 1;
  if (version === 0) throw new Error("Texte trop long pour un QR (versions 1-10)");

  const countBits = version < 10 ? 8 : 16;
  const buf = new BitBuffer();
  buf.put(0b0100, 4);
  buf.put(bytes.length, countBits);
  for (const b of bytes) buf.put(b, 8);
  const totalDataBits = ECC_TABLE[version - 1].reduce((a, [n, d]) => a + n * d, 0) * 8;
  const remaining = totalDataBits - buf.bits.length;
  buf.put(0, Math.min(4, Math.max(0, remaining)));
  while (buf.bits.length % 8 !== 0) buf.put(0, 1);
  const data = buf.bytes();
  for (let pad = 0xEC; data.length * 8 < totalDataBits; pad ^= 0xec ^ 0x11) data.push(pad);

  // Decoupe en blocs, ECC, entrelacement.
  const groups = ECC_TABLE[version - 1];
  const blocks: number[][] = [];
  let offset = 0;
  for (const [count, dataLen] of groups) {
    for (let i = 0; i < count; i++) {
      blocks.push(data.slice(offset, offset + dataLen));
      offset += dataLen;
    }
  }
  const ecLen = groups[0][2];
  const ecc = blocks.map((b) => rsRemainder(b, rsGenerator(ecLen)));
  const codewords: number[] = [];
  const maxData = Math.max(...blocks.map((b) => b.length));
  for (let i = 0; i < maxData; i++) for (const b of blocks) if (i < b.length) codewords.push(b[i]);
  for (let i = 0; i < ecLen; i++) for (const e of ecc) codewords.push(e[i]);

  // Meilleur masque.
  const base = buildFunctionPatterns(version);
  placeData(base, codewords);
  let best = 0;
  let bestScore = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    const trial: Matrix = { size: base.size, modules: base.modules.map((r) => [...r]), reserved: base.reserved.map((r) => [...r]) };
    applyMask(trial, mask);
    writeFormat(trial, mask);
    const score = penalty(trial);
    if (score < bestScore) {
      bestScore = score;
      best = mask;
    }
  }
  const final = buildFunctionPatterns(version);
  placeData(final, codewords);
  applyMask(final, best);
  writeFormat(final, best);
  writeVersion(final, version);
  return { version, size: final.size, modules: final.modules };
}

/** QR en SVG (avec zone de silence), pret a afficher. */
export function qrSvg(text: string, size = 200): string {
  const qr = encodeQr(text);
  const n = qr.size;
  const quiet = 4;
  const total = n + quiet * 2;
  const parts: string[] = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="${size}" height="${size}" role="img" aria-label="QR code">`];
  parts.push(`<rect width="${total}" height="${total}" fill="#fff"/>`);
  let path = "";
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (qr.modules[y][x]) path += `M${x + quiet},${y + quiet}h1v1h-1z`;
    }
  }
  parts.push(`<path d="${path}" fill="#000"/>`);
  parts.push("</svg>");
  return parts.join("");
}
