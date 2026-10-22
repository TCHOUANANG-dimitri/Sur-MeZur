"""Dessin des pieces avec leurs cotes : SVG (ecran), PDF 1:1 et fiche de tracage.

Chaque piece porte :
- la ligne de coupe (trait plein) et la ligne de couture (tirets) ;
- la longueur de chaque bord de couture, ecrite le long du bord, precedee de
  la lettre de la couture (le bord « A » d'une piece se coud au bord « A »
  d'une autre) ;
- la largeur et la hauteur totales (lignes de cote) ;
- les pinces (largeur x profondeur), le pli, le droit-fil ;
- des points numerotes : leurs coordonnees (x, y en cm depuis le coin O en bas
  a gauche) sont dans la fiche de tracage, pour reporter la piece a la craie
  sur le tissu sans imprimer.

Trois sorties :
- `svg_patron`   : toutes les pieces a l'echelle 1:1 (1 unite = 1 mm) ;
- `pdf_echelle`  : la meme chose en PDF, decoupee en pages A4 a assembler, ou
  sur une seule grande page (traceur, imprimerie) ;
- `pdf_tracage`  : une page A4 par piece, dessin reduit + tableau des points.

Coordonnees de dessin : millimetres, y vers le haut. La classe SVG retourne
l'axe y a l'ecriture.
"""

from __future__ import annotations

import html
import io
import math
from datetime import datetime, timezone

import numpy as np
from shapely.geometry import Polygon, box

from .geometrie import Piece

A4 = (210.0, 297.0)
MARGE_PAGE = 10.0
ZONE_A4 = (A4[0] - 2 * MARGE_PAGE, A4[1] - 2 * MARGE_PAGE)
ECART = 40.0  # entre pieces (mm), laisse la place aux cotes
CARRE_TEST = 100.0  # 10 cm

NOIR, GRIS, BLEU, ROUGE, VIOLET, VERT = "#111827", "#6B7280", "#1D4ED8", "#DC2626", "#6D28D9", "#047857"


def fmt(v: float) -> str:
    return f"{v:.1f}".replace(".", ",")


# --- Toiles -------------------------------------------------------------------


class ToileSvg:
    def __init__(self, largeur: float, hauteur: float):
        self.l, self.h = largeur, hauteur
        self.el: list[str] = []

    def _p(self, pts) -> str:
        return " ".join(f"{x:.2f},{self.h - y:.2f}" for x, y in pts)

    def trait(self, pts, ep=0.3, coul=NOIR, tirets=None):
        d = f' stroke-dasharray="{" ".join(map(str, tirets))}"' if tirets else ""
        self.el.append(f'<polyline points="{self._p(pts)}" fill="none" stroke="{coul}" stroke-width="{ep}"{d}/>')

    def polygone(self, pts, ep=0.3, coul=NOIR, fond="none", tirets=None):
        d = f' stroke-dasharray="{" ".join(map(str, tirets))}"' if tirets else ""
        self.el.append(f'<polygon points="{self._p(pts)}" fill="{fond}" stroke="{coul}" stroke-width="{ep}"{d}/>')

    def texte(self, x, y, s, taille, coul=NOIR, gras=False, angle=0.0, ancre="milieu"):
        a = {"debut": "start", "milieu": "middle", "fin": "end"}[ancre]
        g = ' font-weight="bold"' if gras else ""
        yy = self.h - y
        rot = f' transform="rotate({-angle:.2f} {x:.2f} {yy:.2f})"' if angle else ""
        self.el.append(
            f'<text x="{x:.2f}" y="{yy + 0.35 * taille:.2f}" font-size="{taille:.2f}" fill="{coul}" '
            f'text-anchor="{a}"{g}{rot}>{html.escape(s)}</text>'
        )

    def rond(self, x, y, r, coul=NOIR, plein=False):
        self.el.append(
            f'<circle cx="{x:.2f}" cy="{self.h - y:.2f}" r="{r}" fill="{coul if plein else "none"}" '
            f'stroke="{coul}" stroke-width="0.3"/>'
        )

    def rendu(self) -> str:
        return (
            f'<svg xmlns="http://www.w3.org/2000/svg" width="{self.l:.0f}mm" height="{self.h:.0f}mm" '
            f'viewBox="0 0 {self.l:.0f} {self.h:.0f}" font-family="Helvetica, Arial, sans-serif">\n'
            f'<rect width="{self.l:.0f}" height="{self.h:.0f}" fill="#FFFFFF"/>\n'
            + "\n".join(self.el) + "\n</svg>\n"
        )


class ToilePdf:
    """Toile ReportLab en millimetres (y vers le haut, comme le PDF)."""

    def __init__(self, canvas):
        self.c = canvas

    def _coul(self, coul):
        from reportlab.lib.colors import HexColor

        return HexColor(coul)

    def _style(self, ep, coul, tirets):
        self.c.setLineWidth(ep)
        self.c.setStrokeColor(self._coul(coul))
        self.c.setDash(list(tirets) if tirets else [])
        self.c.setLineJoin(1)

    def trait(self, pts, ep=0.3, coul=NOIR, tirets=None):
        self._style(ep, coul, tirets)
        p = self.c.beginPath()
        p.moveTo(*pts[0])
        for x, y in pts[1:]:
            p.lineTo(x, y)
        self.c.drawPath(p, stroke=1, fill=0)

    def polygone(self, pts, ep=0.3, coul=NOIR, fond="none", tirets=None):
        self._style(ep, coul, tirets)
        p = self.c.beginPath()
        p.moveTo(*pts[0])
        for x, y in pts[1:]:
            p.lineTo(x, y)
        p.close()
        if fond != "none":
            self.c.setFillColor(self._coul(fond))
        self.c.drawPath(p, stroke=1, fill=0 if fond == "none" else 1)

    def texte(self, x, y, s, taille, coul=NOIR, gras=False, angle=0.0, ancre="milieu"):
        c = self.c
        c.saveState()
        c.setFillColor(self._coul(coul))
        c.setFont("Helvetica-Bold" if gras else "Helvetica", taille)
        c.translate(x, y)
        if angle:
            c.rotate(angle)
        yb = -0.35 * taille
        {"debut": c.drawString, "milieu": c.drawCentredString, "fin": c.drawRightString}[ancre](0, yb, s)
        c.restoreState()

    def rond(self, x, y, r, coul=NOIR, plein=False):
        self._style(0.3, coul, None)
        if plein:
            self.c.setFillColor(self._coul(coul))
        self.c.circle(x, y, r, stroke=1, fill=1 if plein else 0)


# --- Points de tracage ----------------------------------------------------------


def _le_long(pts: np.ndarray, frac: float) -> tuple[np.ndarray, np.ndarray]:
    """Point a la fraction `frac` de la longueur d'une polyligne, et tangente."""
    seg = np.diff(pts, axis=0)
    lg = np.linalg.norm(seg, axis=1)
    cible = frac * lg.sum()
    acc = 0.0
    for i, l in enumerate(lg):
        if acc + l >= cible and l > 0:
            t = (cible - acc) / l
            return pts[i] + t * seg[i], seg[i] / l
        acc += l
    return pts[-1], (seg[-1] / lg[-1]) if lg[-1] else np.array([1.0, 0.0])


def points_tracage(piece: Piece) -> list[dict]:
    """Points numerotes de la ligne de couture, en cm depuis le coin O (bas
    gauche de la ligne de couture)."""
    anneau = piece.anneau()
    o = anneau.min(axis=0)
    pts = []

    def ajout(p, sorte):
        pts.append({"n": len(pts) + 1, "x": round(float(p[0] - o[0]), 1), "y": round(float(p[1] - o[1]), 1),
                    "sorte": sorte, "_p": p})

    for a in piece.aretes:
        ajout(a.pts[0], "angle")
        if a.courbe and a.longueur > 4:
            for f in (0.25, 0.5, 0.75):
                ajout(_le_long(a.pts, f)[0], "courbe")
    for pc in piece.pinces:
        ajout(pc["sommet"], "pointe de " + pc["type"])
    return pts


def cotes_piece(piece: Piece) -> dict:
    anneau = piece.anneau()
    mn, mx = anneau.min(axis=0), anneau.max(axis=0)
    return {
        "largeur_cm": round(float(mx[0] - mn[0]), 1),
        "hauteur_cm": round(float(mx[1] - mn[1]), 1),
        "bords": [
            {"lettre": a.lettre or None, "longueur_cm": round(a.longueur, 1), "courbe": a.courbe, "pli": a.role == "pli"}
            for a in piece.aretes if a.role != "corde"
        ],
        "pinces": [
            {"type": p["type"], "largeur_cm": round(p["largeur"], 1), "profondeur_cm": round(p["profondeur"], 1)}
            for p in piece.pinces
        ],
    }


# --- Dessin d'une piece -----------------------------------------------------------


def dessiner_piece(t, piece: Piece, ox: float, oy: float, e: float = 1.0, police: float = 1.0,
                   numeros: bool = True) -> None:
    """Dessine la piece. (ox, oy) : coin bas-gauche de la ligne de coupe sur la
    toile (mm) ; e : echelle (1 = taille reelle) ; police : facteur des textes."""
    k = 10.0 * e

    def X(p):
        p = np.atleast_2d(p)
        return [(ox + x * k, oy + y * k) for x, y in p]

    tc = lambda v: v * police  # noqa: E731
    t.polygone(X(piece.coupe), ep=0.5, coul=NOIR)
    anneau = piece.anneau()
    mn, mx = anneau.min(axis=0), anneau.max(axis=0)

    for a in piece.aretes:
        if a.role == "pli":
            t.trait(X(a.pts), ep=0.9, coul=BLEU, tirets=(6, 2, 1, 2))
            m, d = _le_long(a.pts, 0.5)
            ang = _droit(math.degrees(math.atan2(d[1], d[0])))
            n = np.array([-d[1], d[0]])
            (px, py), = X(m + n * tc(6) / k)
            t.texte(px, py, "PLIURE — ne pas couper", tc(4.5), BLEU, gras=True, angle=ang)
            continue
        t.trait(X(a.pts), ep=0.3, coul=GRIS, tirets=(2, 1.5))
        if a.role == "corde" or a.longueur < 1.5:
            continue
        m, d = _le_long(a.pts, 0.5)
        n = np.array([-d[1], d[0]])  # vers l'interieur
        (px, py), = X(m + n * tc(4.5) / k)
        etiquette = (f"{a.lettre} : " if a.lettre else "") + fmt(a.longueur) + (" (courbe)" if a.courbe else "")
        t.texte(px, py, etiquette, tc(3.6), VIOLET if a.lettre else NOIR, gras=bool(a.lettre),
                angle=_droit(math.degrees(math.atan2(d[1], d[0]))))

    for pc in piece.pinces:
        t.trait(X(np.array([pc["a"], pc["sommet"], pc["b"]])), ep=0.4, coul=ROUGE)
        (px, py), = X(pc["sommet"])
        t.texte(px, py - tc(4), f"{pc['type']} {fmt(pc['largeur'])} × {fmt(pc['profondeur'])}", tc(3.2), ROUGE)

    for r, txt in piece.reperes:
        t.trait(X(r), ep=0.35, coul=VERT, tirets=(3, 1.5))
        if txt:
            m, d = _le_long(r, 0.5)
            n = np.array([-d[1], d[0]])
            (px, py), = X(m + n * tc(2.5) / k)
            t.texte(px, py, txt, tc(3.2), VERT, angle=_droit(math.degrees(math.atan2(d[1], d[0]))))

    # Droit-fil : fleche verticale (sur le milieu de manche s'il existe).
    cx = (mn[0] + mx[0]) / 2
    fil = next((r for r, txt in piece.reperes if "droit-fil" in txt), None)
    if fil is not None:
        (ax, ay), (bx, by) = X(np.array([fil[0], fil[-1]]))
        f = tc(3)
        t.polygone([(bx, by), (bx - f / 2, by - f), (bx + f / 2, by - f)], ep=0.3, coul=BLEU, fond=BLEU)
        t.polygone([(ax, ay), (ax - f / 2, ay + f), (ax + f / 2, ay + f)], ep=0.3, coul=BLEU, fond=BLEU)
    poly = piece.polygone()
    rp = poly.representative_point()
    if poly.contains(rp):
        cx = rp.x
    h = (mx[1] - mn[1])
    if fil is None:
        y0, y1 = mn[1] + 0.2 * h, mx[1] - 0.2 * h
        (ax, ay), (bx, by) = X(np.array([[cx, y0], [cx, y1]]))
        t.trait([(ax, ay), (bx, by)], ep=0.5, coul=BLEU)
        f = tc(3)
        t.polygone([(bx, by), (bx - f / 2, by - f), (bx + f / 2, by - f)], ep=0.3, coul=BLEU, fond=BLEU)
        t.polygone([(ax, ay), (ax - f / 2, ay + f), (ax + f / 2, ay + f)], ep=0.3, coul=BLEU, fond=BLEU)
        t.texte(ax - tc(2.5), (ay + by) / 2, "DROIT-FIL", tc(3), BLEU, angle=90)
    else:
        cx = cx + 0.18 * (mx[0] - mn[0])  # titre a cote du milieu de manche

    # Titre de la piece.
    (tx, ty), = X(np.array([cx, mn[1] + 0.55 * h]))
    t.texte(tx + tc(4), ty + tc(6), piece.nom, tc(7), NOIR, gras=True, ancre="debut")
    t.texte(tx + tc(4), ty - tc(1.5), piece.consigne, tc(4.5), NOIR, ancre="debut")
    t.texte(tx + tc(4), ty - tc(7.5), f"fini : {fmt(mx[0] - mn[0])} × {fmt(mx[1] - mn[1])} cm", tc(3.6), GRIS, ancre="debut")

    # Lignes de cote : largeur sous la piece, hauteur a gauche.
    cmn = piece.coupe.min(axis=0)
    (x0, yb), (x1, _) = X(np.array([[mn[0], cmn[1]], [mx[0], cmn[1]]]))
    yb -= tc(8)
    _cote(t, (x0, yb), (x1, yb), f"largeur {fmt(mx[0] - mn[0])} cm", tc(3.6))
    (xg, y0c), (_, y1c) = X(np.array([[cmn[0], mn[1]], [cmn[0], mx[1]]]))
    xg -= tc(8)
    _cote(t, (xg, y0c), (xg, y1c), f"hauteur {fmt(mx[1] - mn[1])} cm", tc(3.6))

    # Coin O et points numerotes.
    (ox0, oy0), = X(mn)
    t.texte(ox0 - tc(2), oy0 - tc(3), "O", tc(4), ROUGE, gras=True, ancre="fin")
    if numeros:
        for p in points_tracage(piece):
            (px, py), = X(p["_p"])
            t.rond(px, py, tc(0.9), ROUGE, plein=p["sorte"] != "courbe")
            t.texte(px + tc(1.5), py + tc(2), str(p["n"]), tc(3), ROUGE, ancre="debut")


def _droit(angle: float) -> float:
    """Angle de texte lisible (jamais a l'envers)."""
    while angle > 90:
        angle -= 180
    while angle <= -90:
        angle += 180
    return angle


def _cote(t, a, b, texte, taille):
    t.trait([a, b], ep=0.25, coul=NOIR)
    d = np.array(b) - np.array(a)
    n = np.array([-d[1], d[0]]) / (np.linalg.norm(d) or 1)
    for p in (a, b):
        t.trait([tuple(np.array(p) - n * 1.5), tuple(np.array(p) + n * 1.5)], ep=0.25, coul=NOIR)
    m = (np.array(a) + np.array(b)) / 2
    ang = _droit(math.degrees(math.atan2(d[1], d[0])))
    off = np.array([-math.sin(math.radians(ang)), math.cos(math.radians(ang))]) * taille * 0.8
    t.texte(m[0] + off[0], m[1] + off[1], texte, taille, NOIR, angle=ang)


def _carre_test(t, x, y):
    t.polygone([(x, y), (x + CARRE_TEST, y), (x + CARRE_TEST, y + CARRE_TEST), (x, y + CARRE_TEST)], ep=0.5)
    t.texte(x + CARRE_TEST / 2, y + CARRE_TEST / 2 + 4, "CARRÉ TEST", 5, NOIR, gras=True)
    t.texte(x + CARRE_TEST / 2, y + CARRE_TEST / 2 - 4, "doit mesurer 10 × 10 cm", 4, NOIR)


# --- Placement ---------------------------------------------------------------------


def placer(pieces: list[Piece]) -> tuple[list[tuple[Piece, float, float]], float, float]:
    """Rangement en etageres, pieces debout (droit-fil vertical). Rend
    (placements, largeur, hauteur) en mm, y vers le haut ; le cartouche et le
    carre test occupent le haut."""
    tailles = [(p, *(p.coupe.max(axis=0) * 10.0)) for p in pieces]
    plus_large = max(w for _, w, _ in tailles)
    largeur_max = max(plus_large + 2 * ECART, 900.0)
    ordre = sorted(tailles, key=lambda x: -x[2])
    rangees: list[list] = [[]]
    x = ECART
    for p, w, h in ordre:
        if x + w + ECART > largeur_max and rangees[-1]:
            rangees.append([])
            x = ECART
        rangees[-1].append((p, x, w, h))
        x += w + ECART
    placements = []
    y = ECART
    for r in reversed(rangees):
        hr = max(h for *_, h in r)
        for p, x, w, h in r:
            placements.append((p, x, y))
        y += hr + ECART
    largeur = max(x + w for r in rangees for _, x, w, _ in r) + ECART
    hauteur = y + CARRE_TEST + 30  # cartouche a gauche et carre test a droite, sur la meme bande
    return placements, max(largeur, 2 * CARRE_TEST + 200), hauteur


def _cartouche(t, x, y, lignes: list[str]):
    """Texte en haut a gauche, (x, y) = ligne de base du titre."""
    t.texte(x, y, lignes[0], 9, NOIR, gras=True, ancre="debut")
    for i, l in enumerate(lignes[1:], start=1):
        t.texte(x, y - 4 - i * 6.5, l, 4.5, GRIS if i > 1 else NOIR, ancre="debut")


def dessiner_tout(t, placements, largeur, hauteur, lignes):
    for p, x, y in placements:
        dessiner_piece(t, p, x, y)
    _cartouche(t, ECART, hauteur - 18, lignes)
    _carre_test(t, largeur - ECART - CARRE_TEST, hauteur - CARRE_TEST - 15)


def svg_patron(pieces: list[Piece], lignes: list[str]) -> str:
    placements, l, h = placer(pieces)
    t = ToileSvg(l, h)
    dessiner_tout(t, placements, l, h, lignes)
    return t.rendu()


# --- PDF a l'echelle 1:1 -----------------------------------------------------------


def _canvas(buf, taille_mm):
    from reportlab.lib.units import mm
    from reportlab.pdfgen import canvas

    c = canvas.Canvas(buf, pagesize=(taille_mm[0] * mm, taille_mm[1] * mm))
    c.setTitle("Patron Sur-MeZur")
    c.setCreator("Sur-MeZur")
    return c


def _debut_page(c):
    from reportlab.lib.units import mm

    c.scale(mm, mm)


def pdf_echelle(pieces: list[Piece], lignes: list[str], pleine_page: bool = False) -> tuple[bytes, list[dict]]:
    """PDF 1:1. En A4 : page 1 = plan d'assemblage + carre test, puis une
    page par case de la grille (les cases vides sont sautees). Rend (pdf,
    liste des pages)."""
    placements, L, H = placer(pieces)
    buf = io.BytesIO()
    if pleine_page:
        c = _canvas(buf, (L, H))
        _debut_page(c)
        dessiner_tout(ToilePdf(c), placements, L, H, lignes)
        c.showPage()
        c.save()
        return buf.getvalue(), [{"page": 1, "case": "pleine taille", "format_mm": [round(L), round(H)]}]

    zw, zh = ZONE_A4
    ncol, nlig = math.ceil(L / zw), math.ceil(H / zh)
    formes = [Polygon(np.asarray(p.coupe) * 10 + [x, y]) for p, x, y in placements]
    cases = []
    for li in range(nlig):  # ligne 1 = en haut
        for co in range(ncol):
            x0, y1 = co * zw, H - li * zh
            zone = box(x0, y1 - zh, x0 + zw, y1)
            if li == 0 or any(zone.intersects(f) for f in formes):
                cases.append((li, co, x0, y1 - zh))
    c = _canvas(buf, A4)

    # Page 1 : mode d'emploi, carre test, plan des pages.
    _debut_page(c)
    t = ToilePdf(c)
    t.texte(MARGE_PAGE, A4[1] - 20, lignes[0], 8, NOIR, gras=True, ancre="debut")
    consignes = [
        "1. Imprimez à 100 % (taille réelle), sans « ajuster à la page ».",
        "2. Mesurez le carré test : il doit faire 10 × 10 cm.",
        "3. Découpez chaque page le long du cadre fin et assemblez-les",
        "   selon le plan ci-dessous (ligne, colonne), repères + sur +.",
        "4. Les cotes écrites sur les pièces sont en cm, ligne de couture.",
    ] + [f"   {m}" for l in lignes[1:] for m in _couper(l, 95)]
    for i, s in enumerate(consignes):
        t.texte(MARGE_PAGE, A4[1] - 32 - i * 6, s, 4, NOIR, ancre="debut")
    _carre_test(t, A4[0] - MARGE_PAGE - CARRE_TEST, MARGE_PAGE + 5)
    # Plan d'assemblage miniature.
    e = min(80 / L, 100 / H)
    px, py = MARGE_PAGE, MARGE_PAGE + 5
    for f in formes:
        t.polygone([(px + x * e, py + y * e) for x, y in np.asarray(f.exterior.coords)], ep=0.2, coul=GRIS)
    for li, co, x0, y0 in cases:
        t.polygone([(px + x0 * e, py + y0 * e), (px + (x0 + zw) * e, py + y0 * e),
                    (px + (x0 + zw) * e, py + (y0 + zh) * e), (px + x0 * e, py + (y0 + zh) * e)], ep=0.2, coul=BLEU)
        t.texte(px + (x0 + zw / 2) * e, py + (y0 + zh / 2) * e, f"{li + 1}-{co + 1}", 3, BLEU)
    c.showPage()

    pages = [{"page": 1, "case": "plan d'assemblage"}]
    for n, (li, co, x0, y0) in enumerate(cases, start=2):
        _debut_page(c)
        c.saveState()
        p = c.beginPath()
        p.rect(MARGE_PAGE, MARGE_PAGE, zw, zh)
        c.clipPath(p, stroke=0, fill=0)
        c.translate(MARGE_PAGE - x0, MARGE_PAGE - y0)
        dessiner_tout(ToilePdf(c), placements, L, H, lignes)
        c.restoreState()
        t = ToilePdf(c)
        t.polygone([(MARGE_PAGE, MARGE_PAGE), (MARGE_PAGE + zw, MARGE_PAGE), (MARGE_PAGE + zw, MARGE_PAGE + zh),
                    (MARGE_PAGE, MARGE_PAGE + zh)], ep=0.2, coul=GRIS)
        for cx, cy in ((MARGE_PAGE, MARGE_PAGE), (MARGE_PAGE + zw, MARGE_PAGE),
                       (MARGE_PAGE, MARGE_PAGE + zh), (MARGE_PAGE + zw, MARGE_PAGE + zh)):
            t.trait([(cx - 5, cy), (cx + 5, cy)], ep=0.3, coul=ROUGE)
            t.trait([(cx, cy - 5), (cx, cy + 5)], ep=0.3, coul=ROUGE)
        t.texte(A4[0] / 2, A4[1] - 5, f"Ligne {li + 1}, colonne {co + 1}  —  page {n}/{len(cases) + 1}", 3.5, NOIR)
        t.texte(A4[0] / 2, 4, "Imprimer à 100 % — vérifier le carré test (page 1)", 3, GRIS)
        c.showPage()
        pages.append({"page": n, "case": f"{li + 1}-{co + 1}"})
    c.save()
    return buf.getvalue(), pages


# --- Fiche de tracage -------------------------------------------------------------


def _recapitulatif(c, pieces, lignes, coutures, remarques):
    """Page 1 de la fiche : quoi couper, quoi coudre avec quoi, consignes."""
    _debut_page(c)
    t = ToilePdf(c)
    y = A4[1] - 18
    t.texte(MARGE_PAGE, y, lignes[0], 8, NOIR, gras=True, ancre="debut")
    # Les mesures du client ont leur propre section, en colonnes : sur une
    # seule ligne, elles sortaient de la page.
    mesures = [l for l in lignes[1:] if l.startswith("Mesures : ")]
    y -= 2  # le sous-titre ne touche pas le titre
    for s in lignes[1:]:
        if s in mesures:
            continue
        for morceau in _couper(s, 150):
            y -= 5
            t.texte(MARGE_PAGE, y, morceau, 3.3, GRIS, ancre="debut")

    def titre(s):
        nonlocal y
        y -= 12
        t.texte(MARGE_PAGE, y, s, 5, NOIR, gras=True, ancre="debut")
        y -= 3

    def ligne(s, coul=NOIR, gras=False, retrait=0.0):
        nonlocal y
        y -= 5.5
        t.texte(MARGE_PAGE + retrait, y, s, 3.8, coul, gras=gras, ancre="debut")

    if mesures:
        titre("Mesures du client (cm)")
        items = [m.strip() for m in mesures[0][len("Mesures : "):].split(",") if m.strip()]
        colonne = (A4[0] - 2 * MARGE_PAGE) / 3
        for i in range(0, len(items), 3):
            y -= 5.5
            for j, item in enumerate(items[i:i + 3]):
                t.texte(MARGE_PAGE + j * colonne, y, item, 3.8, NOIR, ancre="debut")

    titre("Pièces à couper")
    for i, p in enumerate(pieces, start=1):
        cot = cotes_piece(p)
        ligne(f"{i}. {p.nom} — {p.consigne} — {fmt(cot['largeur_cm'])} × {fmt(cot['hauteur_cm'])} cm (fini)")
        for pc in cot["pinces"]:
            ligne(f"{pc['type']} : {fmt(pc['largeur_cm'])} cm de large, {fmt(pc['profondeur_cm'])} cm de profondeur",
                  GRIS, retrait=6)
    titre("Coutures (même lettre = bords à coudre ensemble)")
    for cc in coutures:
        ligne(f"{cc['lettre']} : {cc['piece_1']} {fmt(cc['longueur_1'])} cm  avec  {cc['piece_2']} {fmt(cc['longueur_2'])} cm",
              VIOLET)
    if remarques:
        titre("À savoir")
        for r in remarques:
            for morceau in _couper(r, 105):
                ligne(morceau)
    c.showPage()


def _couper(s: str, n: int) -> list[str]:
    mots, out, cour = s.split(), [], ""
    for m in mots:
        if len(cour) + len(m) + 1 > n:
            out.append(cour)
            cour = m
        else:
            cour = f"{cour} {m}".strip()
    return out + [cour] if cour else out


def pdf_tracage(pieces: list[Piece], lignes: list[str], valeur_couture_cm: float,
                coutures: list[dict] | None = None, remarques: list[str] | None = None) -> bytes:
    """Page 1 : recapitulatif. Puis une page par piece : dessin reduit avec
    toutes ses cotes, et tableau des points a reporter sur le tissu (cm depuis
    le coin O)."""
    buf = io.BytesIO()
    c = _canvas(buf, A4)
    _recapitulatif(c, pieces, lignes, coutures or [], remarques or [])
    for i, piece in enumerate(pieces, start=1):
        _debut_page(c)
        t = ToilePdf(c)
        t.texte(MARGE_PAGE, A4[1] - 14, f"{piece.nom} — {piece.consigne}", 7, NOIR, gras=True, ancre="debut")
        t.texte(MARGE_PAGE, A4[1] - 21, lignes[0], 3.6, GRIS, ancre="debut")
        t.texte(A4[0] - MARGE_PAGE, A4[1] - 14, f"pièce {i}/{len(pieces)}", 3.6, GRIS, ancre="fin")
        pts = points_tracage(piece)
        # Zone dessin en haut, tableau en bas.
        n_col = 3
        lignes_tab = math.ceil(len(pts) / n_col)
        haut_tab = 22 + lignes_tab * 4.6
        zone_w, zone_h = A4[0] - 2 * MARGE_PAGE - 24, A4[1] - 2 * MARGE_PAGE - 30 - haut_tab - 18
        dims = piece.coupe.max(axis=0) * 10.0
        e = min(zone_w / dims[0], zone_h / dims[1], 1.0)
        ox = MARGE_PAGE + 18 + (zone_w - dims[0] * e) / 2
        oy = MARGE_PAGE + haut_tab + 18 + (zone_h - dims[1] * e) / 2
        dessiner_piece(t, piece, ox, oy, e=e, police=0.75)
        t.texte(A4[0] - MARGE_PAGE, A4[1] - 27, f"dessin à l'échelle 1/{1 / e:.0f} : ne pas mesurer sur le papier, utiliser les cotes",
                3.2, ROUGE, ancre="fin")
        # Tableau des points.
        y = MARGE_PAGE + haut_tab
        t.texte(MARGE_PAGE, y, "Points à reporter (cm, depuis O : x vers la droite, y vers le haut)", 4, NOIR, gras=True, ancre="debut")
        t.texte(MARGE_PAGE, y - 6, f"Reliez les points dans l'ordre (droites ; « c » = sur une courbe, à arrondir), "
                f"puis ajoutez {fmt(valeur_couture_cm)} cm de couture tout autour, sauf sur la pliure.", 3.2, GRIS, ancre="debut")
        col_w = (A4[0] - 2 * MARGE_PAGE) / n_col
        for j, p in enumerate(pts):
            co, li = divmod(j, lignes_tab)
            xx = MARGE_PAGE + co * col_w
            yy = y - 14 - li * 4.6
            marque = " c" if p["sorte"] == "courbe" else (" (pointe)" if p["sorte"].startswith("pointe") else "")
            t.texte(xx, yy, f"{p['n']:>2}.", 3.6, ROUGE, gras=True, ancre="debut")
            t.texte(xx + 8, yy, f"x {fmt(p['x'])}   y {fmt(p['y'])}{marque}", 3.6, NOIR, ancre="debut")
        c.showPage()
    c.save()
    return buf.getvalue()


def horodatage() -> str:
    return datetime.now(timezone.utc).strftime("%d/%m/%Y")
