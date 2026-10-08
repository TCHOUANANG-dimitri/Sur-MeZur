"""Moteur « preview-v0 » de generation de patron (A2.4).

Pour l'instant, AUCUN calcul a partir de l'image : l'image sert de reference
visuelle, stockee et affichee. Ce moteur dessine un patron de base a plat
(pieces devant, dos, manche ou jambe selon le type de vetement) directement a
partir des mensurations, en SVG a l'echelle 1:1 (1 unite = 1 mm), marges de
couture indiquees, decoupage en tuiles A4 imprimables avec reperes
d'assemblage. Le resultat porte la mention « Apercu ».

Le contrat est pense pour brancher plus tard un vrai moteur (`engine`
different) sans changer l'API : `generate_preview_svg` prend un type de
vetement et des mensurations, et rend (svg, fiche technique).
"""

from __future__ import annotations

import html
from datetime import datetime, timezone

# Types de vetements acceptes par POST /tailor/patterns.
GARMENT_TYPES = ("robe", "jupe", "chemise", "pantalon", "boubou", "kaba")

PREVIEW_NOTE = "Aperçu — la génération à partir de l'image arrive bientôt."

# Marge de couture dessinee autour de chaque piece (mm).
SEAM_MM = 10
# Aisance ajoutee au demi-tour de buste/taille/hanches (mm).
EASE_MM = 20
# Zone imprimable d'une page A4 avec 10 mm de marges (mm).
PAGE_W_MM = 190
PAGE_H_MM = 277


def _mm(measurements: dict, key: str, default_cm: float) -> tuple[float, bool]:
    """Valeur en mm, ou defaut. Rend (valeur, estimee)."""
    try:
        v = float(measurements.get(key, default_cm))
    except (TypeError, ValueError):
        v = default_cm
    estimated = key not in (measurements or {})
    return max(10.0, v * 10.0), estimated


def _mm_alias(measurements: dict, keys: list[str], default_cm: float) -> tuple[float, bool]:
    """Premiere cle trouvee parmi les alias (ex. sleeve/sleeve_length)."""
    m = measurements or {}
    for k in keys:
        if k in m:
            return _mm(m, k, default_cm)
    return _mm(m, keys[0], default_cm)


def _pieces_for(garment_type: str, m: dict) -> tuple[list[dict], bool]:
    """Pieces du patron de base : (etiquette, largeur finie mm, hauteur mm,
    clefs utilisees). Toute valeur manquante est remplacee par un defaut et
    signalee comme estimee dans la fiche."""
    chest, e1 = _mm(m, "chest", 92.0)
    waist, e2 = _mm(m, "waist", 76.0)
    hips, e3 = _mm(m, "hips", 98.0)
    thigh, e4 = _mm(m, "thigh", 58.0)
    biceps, e5 = _mm(m, "biceps", 30.0)
    # Alias : la chaine de vision et le parcours client n'utilisent pas
    # toujours les memes noms (sleeve/sleeve_length, outseam/inseam).
    sleeve, e6 = _mm_alias(m, ["sleeve", "sleeve_length"], 60.0)
    back, e7 = _mm(m, "back_length", 42.0)
    outseam, e8 = _mm_alias(m, ["outseam", "inseam"], 102.0)
    estimated = any([e1, e2, e3, e4, e5, e6, e7, e8])

    half = lambda c: round(c / 2 + EASE_MM, 1)  # demi-tour + aisance
    if garment_type == "robe":
        pieces = [
            {"label": "Devant", "w": half(chest), "h": round(outseam, 1), "keys": ["chest"]},
            {"label": "Dos", "w": half(chest), "h": round(outseam, 1), "keys": ["chest"]},
            {"label": "Manche", "w": half(biceps), "h": round(sleeve, 1), "keys": ["biceps", "sleeve"]},
        ]
    elif garment_type == "jupe":
        skirt_len = round(outseam * 0.55, 1)
        pieces = [
            {"label": "Devant", "w": half(hips), "h": skirt_len, "keys": ["hips"]},
            {"label": "Dos", "w": half(hips), "h": skirt_len, "keys": ["hips"]},
            {"label": "Ceinture", "w": round(waist + 2 * EASE_MM, 1), "h": 80.0, "keys": ["waist"]},
        ]
    elif garment_type == "chemise":
        pieces = [
            {"label": "Devant", "w": half(chest), "h": round(back, 1), "keys": ["chest", "back_length"]},
            {"label": "Dos", "w": half(chest), "h": round(back, 1), "keys": ["chest", "back_length"]},
            {"label": "Manche", "w": half(biceps), "h": round(sleeve, 1), "keys": ["biceps", "sleeve"]},
        ]
    elif garment_type == "pantalon":
        pieces = [
            {"label": "Devant jambe", "w": half(thigh), "h": round(outseam, 1), "keys": ["thigh", "outseam"]},
            {"label": "Dos jambe", "w": half(thigh), "h": round(outseam, 1), "keys": ["thigh", "outseam"]},
            {"label": "Ceinture", "w": round(waist + 2 * EASE_MM, 1), "h": 80.0, "keys": ["waist"]},
        ]
    else:  # boubou, kaba : grand panneau devant/dos
        pieces = [
            {"label": "Panneau avant", "w": half(chest), "h": round(outseam, 1), "keys": ["chest", "outseam"]},
            {"label": "Panneau arrière", "w": half(chest), "h": round(outseam, 1), "keys": ["chest", "outseam"]},
        ]
    return pieces, estimated


def _esc(text: object) -> str:
    return html.escape(str(text), quote=True)


def generate_preview_svg(
    garment_type: str,
    measurements: dict,
    title: str = "Patron",
) -> tuple[str, dict]:
    """Dessine le patron d'apercu. Rend (svg, fiche technique)."""
    pieces, estimated = _pieces_for(garment_type, measurements or {})
    stamp = datetime.now(timezone.utc).strftime("%d/%m/%Y")

    gap = 30
    x = 20.0
    max_h = 0.0
    layout: list[dict] = []
    for p in pieces:
        w, h = p["w"] + 2 * SEAM_MM, p["h"] + 2 * SEAM_MM
        layout.append({**p, "x": x, "y": 150.0, "w": w, "h": h})
        x += w + gap
        max_h = max(max_h, h)
    full_w = x + 10
    full_h = 150.0 + max_h + 60

    s: list[str] = []
    s.append(
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{full_w:.0f}mm" height="{(full_h + _tiles_height(layout) + 40):.0f}mm" '
        f'viewBox="0 0 {full_w:.0f} {full_h + _tiles_height(layout) + 40:.0f}" font-family="sans-serif">'
    )
    s.append(f'<rect width="{full_w:.0f}" height="{full_h + _tiles_height(layout) + 40:.0f}" fill="#FFFFFF"/>')
    s.append(f'<text x="20" y="36" font-size="22" font-weight="bold" fill="#1F2A44">{_esc(title)}</text>')
    s.append(f'<text x="20" y="62" font-size="13" fill="#4B5563">Type : {_esc(garment_type)} — échelle 1:1 (1 unité = 1 mm) — {stamp}</text>')
    s.append(f'<text x="20" y="84" font-size="13" font-style="italic" fill="#B45309">{_esc(PREVIEW_NOTE)}</text>')
    s.append(f'<text x="20" y="106" font-size="12" fill="#4B5563">Marge de couture : {SEAM_MM} mm (pointillés) — droit-fil : flèche verticale — valeurs {"partiellement estimées" if estimated else "issues des mensurations"}</text>')

    for i, p in enumerate(layout):
        px, py, pw, ph = p["x"], p["y"], p["w"], p["h"]
        # Ligne de coupe (avec marges).
        s.append(f'<rect x="{px:.1f}" y="{py:.1f}" width="{pw:.1f}" height="{ph:.1f}" fill="none" stroke="#9CA3AF" stroke-width="1" stroke-dasharray="8 5"/>')
        # Piece finie.
        s.append(f'<rect x="{px + SEAM_MM:.1f}" y="{py + SEAM_MM:.1f}" width="{p["w"] - 2 * SEAM_MM:.1f}" height="{p["h"] - 2 * SEAM_MM:.1f}" fill="#EEF2FF" stroke="#1D4ED8" stroke-width="1.5"/>')
        # Droit-fil.
        cx = px + pw / 2
        s.append(f'<line x1="{cx:.1f}" y1="{py + SEAM_MM + 14:.1f}" x2="{cx:.1f}" y2="{py + ph - SEAM_MM - 14:.1f}" stroke="#1D4ED8" stroke-width="1"/>')
        s.append(f'<polygon points="{cx:.1f},{py + SEAM_MM + 8:.1f} {cx - 5:.1f},{py + SEAM_MM + 18:.1f} {cx + 5:.1f},{py + SEAM_MM + 18:.1f}" fill="#1D4ED8"/>')
        s.append(f'<text x="{px + SEAM_MM + 6:.1f}" y="{py + SEAM_MM + 16:.1f}" font-size="14" font-weight="bold" fill="#1F2A44">{_esc(p["label"])}</text>')
        s.append(f'<text x="{px + SEAM_MM + 6:.1f}" y="{py + ph - SEAM_MM - 8:.1f}" font-size="12" fill="#374151">{p["w"] - 2 * SEAM_MM:.0f} × {p["h"] - 2 * SEAM_MM:.0f} mm</text>')
        s.append(f'<text x="{px + SEAM_MM + 6:.1f}" y="{py + SEAM_MM + 32:.1f}" font-size="10" fill="#6B7280">pliure à gauche — pièce {i + 1}</text>')

    # --- Tuiles A4 : chaque page montre le fragment des pieces qu'elle couvre.
    tiles = _tiles(layout)
    ty = full_h + 30
    s.append(f'<text x="20" y="{ty - 8:.0f}" font-size="16" font-weight="bold" fill="#1F2A44">Découpe A4 ({len(tiles)} page(s) de {PAGE_W_MM} × {PAGE_H_MM} mm) — imprimez à 100 %, assemblez sur les repères +</text>')
    for n, t in enumerate(tiles, start=1):
        ox = 20 + 0
        oy = ty + (n - 1) * (PAGE_H_MM + 26)
        s.append(f'<rect x="{ox}" y="{oy}" width="{PAGE_W_MM}" height="{PAGE_H_MM}" fill="none" stroke="#111827" stroke-width="1.5"/>')
        s.append(f'<text x="{ox + 6}" y="{oy + 16}" font-size="11" font-weight="bold" fill="#111827">Page {n}/{len(tiles)} — {_esc(t["covers"])}</text>')
        s.append(
            f'<g><clipPath id="tile{n}"><rect x="{ox}" y="{oy}" width="{PAGE_W_MM}" height="{PAGE_H_MM}"/></clipPath>'
            f'<g clip-path="url(#tile{n})">'
        )
        dx = ox - t["x"]
        dy = (oy + 20) - (150.0 + t["y"])
        for p in layout:
            px, py, pw, ph = p["x"] + dx, p["y"] + dy, p["w"], p["h"]
            s.append(f'<rect x="{px:.1f}" y="{py:.1f}" width="{pw:.1f}" height="{ph:.1f}" fill="none" stroke="#9CA3AF" stroke-width="1" stroke-dasharray="8 5"/>')
            s.append(f'<rect x="{px + SEAM_MM:.1f}" y="{py + SEAM_MM:.1f}" width="{p["w"] - 2 * SEAM_MM:.1f}" height="{p["h"] - 2 * SEAM_MM:.1f}" fill="#EEF2FF" stroke="#1D4ED8" stroke-width="1.5"/>')
        s.append("</g></g>")
        # Reperes d'assemblage aux quatre coins.
        for cx, cy in ((ox, oy), (ox + PAGE_W_MM, oy), (ox, oy + PAGE_H_MM), (ox + PAGE_W_MM, oy + PAGE_H_MM)):
            s.append(f'<circle cx="{cx}" cy="{cy}" r="4" fill="none" stroke="#DC2626" stroke-width="1.5"/>')
            s.append(f'<line x1="{cx - 9}" y1="{cy}" x2="{cx + 9}" y2="{cy}" stroke="#DC2626" stroke-width="1.5"/>')
            s.append(f'<line x1="{cx}" y1="{cy - 9}" x2="{cx}" y2="{cy + 9}" stroke="#DC2626" stroke-width="1.5"/>')

    s.append("</svg>")
    svg = "\n".join(s)
    tech = {
        "engine": "preview-v0",
        "garment_type": garment_type,
        "scale": "1:1 mm",
        "seam_allowance_mm": SEAM_MM,
        "ease_mm": EASE_MM,
        "estimated_values": estimated,
        "note": PREVIEW_NOTE,
        "pieces": [{"label": p["label"], "w_mm": p["w"] - 2 * SEAM_MM, "h_mm": p["h"] - 2 * SEAM_MM, "keys": p["keys"]} for p in layout],
        "pages": [{"page": n, "label": t["covers"]} for n, t in enumerate(tiles, start=1)],
    }
    return svg, tech


def _tiles_height(layout: list[dict]) -> float:
    tiles = _tiles(layout)
    return len(tiles) * (PAGE_H_MM + 26) + 10 if tiles else 0


def _tiles(layout: list[dict]) -> list[dict]:
    """Decoupe le rectangle englobant les pieces en pages A4 (sans
    chevauchement), avec la liste des pieces couvertes par page."""
    if not layout:
        return []
    min_x = min(p["x"] for p in layout)
    min_y = 150.0
    max_x = max(p["x"] + p["w"] for p in layout)
    max_y = max(150.0 + p["h"] for p in layout)
    tiles: list[dict] = []
    y = min_y
    while y < max_y:
        x = min_x
        while x < max_x:
            covers = sorted({p["label"] for p in layout
                             if p["x"] < x + PAGE_W_MM and p["x"] + p["w"] > x
                             and 150.0 < y + PAGE_H_MM and 150.0 + p["h"] > y})
            tiles.append({"x": x - min_x, "y": y - min_y, "covers": ", ".join(covers) or "—"})
            x += PAGE_W_MM
        y += PAGE_H_MM
    return tiles