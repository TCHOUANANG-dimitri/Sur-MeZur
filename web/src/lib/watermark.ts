/**
 * Photo de modele marquee « Sur-MeZur », a telecharger ou a imprimer.
 *
 * La photo est redessinee dans le navigateur (canvas) : le nom repete en
 * diagonale, discret, sur toute l'image — difficile a rogner — et le logo
 * avec le nom en bas a droite. Rien ne part au serveur.
 *
 * Les photos du catalogue sont servies par le site lui-meme (`/uploads`,
 * reecrit vers l'API dans next.config.ts) : le canvas n'est donc jamais
 * « contamine » par une image d'une autre origine et peut etre exporte.
 */

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (/^https?:\/\//.test(src) && !src.startsWith(window.location.origin)) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Image introuvable."));
    img.src = src;
  });
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** La photo `src` avec le filigrane, en JPEG a sa resolution d'origine. */
export async function watermarkedPhoto(src: string): Promise<Blob> {
  const font = getComputedStyle(document.documentElement).getPropertyValue("--font-display").trim() || "Georgia, serif";
  const [img, logo] = await Promise.all([
    loadImage(src),
    loadImage("/logo-mark.png").catch(() => null),
    document.fonts?.load(`700 40px ${font}`).catch(() => undefined),
  ]);

  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Navigateur incompatible.");
  ctx.drawImage(img, 0, 0);

  // 1 % du grand cote : tailles proportionnelles a l'image.
  const u = Math.max(w, h) / 100;

  // Nom repete en diagonale, en quinconce.
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate(-Math.PI / 6);
  ctx.font = `700 ${Math.round(u * 4)}px ${font}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(255, 255, 255, 0.18)";
  ctx.strokeStyle = "rgba(0, 0, 0, 0.07)";
  ctx.lineWidth = Math.max(1, u * 0.1);
  const pasX = u * 30;
  const pasY = u * 13;
  const demi = Math.hypot(w, h) / 2;
  for (let y = -demi, rang = 0; y <= demi; y += pasY, rang++) {
    for (let x = -demi + (rang % 2) * (pasX / 2); x <= demi; x += pasX) {
      ctx.strokeText("Sur-MeZur", x, y);
      ctx.fillText("Sur-MeZur", x, y);
    }
  }
  ctx.restore();

  // Logo et nom en bas a droite, sur une pastille claire.
  const taille = Math.round(u * 3.4);
  ctx.font = `700 ${taille}px ${font}`;
  const texte = ctx.measureText("Sur-MeZur").width;
  const logoH = logo ? taille * 1.5 : 0;
  const logoW = logo ? (logo.naturalWidth / logo.naturalHeight) * logoH : 0;
  const pad = u * 1.4;
  const pilleW = pad * 2 + logoW + (logo ? u * 0.8 : 0) + texte;
  const pilleH = Math.max(logoH, taille) + pad * 1.4;
  const px = w - pilleW - u * 2.5;
  const py = h - pilleH - u * 2.5;
  ctx.fillStyle = "rgba(255, 255, 255, 0.86)";
  roundRect(ctx, px, py, pilleW, pilleH, pilleH / 2);
  ctx.fill();
  if (logo) ctx.drawImage(logo, px + pad, py + (pilleH - logoH) / 2, logoW, logoH);
  ctx.fillStyle = "#5b21b6";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText("Sur-MeZur", px + pad + logoW + (logo ? u * 0.8 : 0), py + pilleH / 2);

  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Image non enregistrée."))), "image/jpeg", 0.92)
  );
}

/** Nom de fichier lisible : « sur-mezur-robe-de-soiree-0052.jpg ». */
export function photoFileName(modelName: string): string {
  const slug = modelName
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `sur-mezur-${slug || "modele"}.jpg`;
}
