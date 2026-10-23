"""Panneaux GarmentCode -> pieces de patron lisibles par un tailleur.

GarmentCode decrit un vetement comme le ferait un logiciel de simulation :
moities gauche et droite separees, manche en deux demi-pieces, pinces
melangees aux bords, aucune valeur de couture. Ici on le transforme en pieces
de coupe :

1. chaque bord est echantillonne en points (cm) ;
2. une paire gauche/droite devient « couper 1 au pli » si les deux moities se
   cousent sur une ligne droite (milieu devant), sinon « couper 2 » ;
3. une piece symetrique (jupe devant) est montree en moitie, au pli ;
4. les deux demi-manches sont reunies en une manche ;
5. les pinces sont reperees (deux bords droits en V) ;
6. les coutures a assembler recoivent une lettre (A, B, C...) sur les deux
   pieces, avec leur longueur ;
7. la ligne de coupe = ligne de couture + valeur de couture (rien sur le pli).

Unites : centimetres, y vers le haut (repere GarmentCode).
"""

from __future__ import annotations

import math
import re
from dataclasses import dataclass, field

import numpy as np
from shapely.geometry import Polygon
from shapely.ops import unary_union

N_COURBE = 32  # points par bord courbe


@dataclass
class Arete:
    pts: np.ndarray  # (n, 2), du debut a la fin du bord, dans le sens du contour
    courbe: bool
    src: tuple[str, int] | None = None  # (panneau GarmentCode, indice du bord)
    role: str = ""  # "" | "pli" | "corde" (ouverture d'une pince, pas un bord de couture)
    lettre: str = ""  # couture a assembler (A, B...)

    @property
    def longueur(self) -> float:
        return float(np.linalg.norm(np.diff(self.pts, axis=0), axis=1).sum())


@dataclass
class Piece:
    cle: str
    nom: str
    aretes: list[Arete]
    quantite: int = 1
    consigne: str = "Couper 1"
    pinces: list[dict] = field(default_factory=list)
    reperes: list[tuple[np.ndarray, str]] = field(default_factory=list)  # lignes a reporter (pas a couper)
    droit_fil: float = 90.0  # angle (degres) du droit-fil dans le repere de la piece
    coupe: np.ndarray | None = None  # contour de coupe (avec valeur de couture)

    def anneau(self) -> np.ndarray:
        return np.vstack([a.pts[:-1] for a in self.aretes])

    def polygone(self) -> Polygon:
        return Polygon(self.anneau())

    def appliquer(self, f) -> None:
        for a in self.aretes:
            a.pts = f(a.pts)
        for p in self.pinces:
            for k in ("a", "sommet", "b"):
                p[k] = f(p[k][None, :])[0]
        self.reperes = [(f(r), txt) for r, txt in self.reperes]
        if self.coupe is not None:
            self.coupe = f(self.coupe)


# --- 1. Echantillonnage -------------------------------------------------------


def _rel_to_abs(start, end, rel):
    edge = end - start
    perp = np.array([-edge[1], edge[0]])
    return start + rel[0] * edge + rel[1] * perp


def _arc(start, end, r, large, right, n):
    """Arc de cercle de rayon r (meme convention que GarmentCode/SVG en y vers
    le bas : sweep = not right)."""
    import svgpathtools as svgpath

    seg = svgpath.Arc(complex(*start), complex(r, r), 0, bool(large), not right, complex(*end))
    return np.array([[seg.point(t).real, seg.point(t).imag] for t in np.linspace(0, 1, n)])


def echantillonner(verts: np.ndarray, edge: dict) -> tuple[np.ndarray, bool]:
    """Points d'un bord GarmentCode. On calcule en y vers le bas comme
    GarmentCode le fait pour son SVG, puis on revient en y vers le haut."""
    v = verts * np.array([1.0, -1.0])
    s, e = v[edge["endpoints"][0]], v[edge["endpoints"][1]]
    c = edge.get("curvature")
    if not c:
        pts = np.array([s, e])
        courbe = False
    else:
        t = np.linspace(0, 1, N_COURBE)[:, None]
        if isinstance(c, list) or c.get("type") == "quadratic":
            p = c if isinstance(c, list) else c["params"][0]
            cp = _rel_to_abs(s, e, [p[0], -p[1]])
            pts = (1 - t) ** 2 * s + 2 * (1 - t) * t * cp + t ** 2 * e
        elif c["type"] == "cubic":
            c1, c2 = (_rel_to_abs(s, e, [p[0], -p[1]]) for p in c["params"])
            pts = (1 - t) ** 3 * s + 3 * (1 - t) ** 2 * t * c1 + 3 * (1 - t) * t ** 2 * c2 + t ** 3 * e
        elif c["type"] == "circle":
            r, large, right = c["params"]
            pts = _arc(s, e, r, large, right, N_COURBE)
        else:
            raise ValueError(f"Courbe inconnue : {c['type']}")
        courbe = True
    return pts * np.array([1.0, -1.0]), courbe


# --- Noms ---------------------------------------------------------------------

NOMS = [
    (r"ftorso", "Devant"), (r"btorso", "Dos"), (r"sleeve", "Manche"),
    (r"^skirt_front$", "Jupe devant"), (r"^skirt_back$", "Jupe dos"),
    (r"^skirt_front_(\d+)", "Étage {0} devant"), (r"^skirt_back_(\d+)", "Étage {0} dos"),
    (r"wb_front", "Ceinture devant"), (r"wb_back", "Ceinture dos"),
    (r"pant_f", "Pantalon devant"), (r"pant_b", "Pantalon dos"),
    (r"cuff", "Poignet"), (r"collar|lapel|turtle", "Col"),
]


def nom_piece(cle: str) -> str:
    for motif, nom in NOMS:
        m = re.search(motif, cle)
        if m:
            return nom.format(*m.groups())
    return cle.replace("_", " ")


# --- Construction -------------------------------------------------------------


def pieces_depuis_spec(spec: dict) -> list[Piece]:
    out = []
    for cle in spec["panel_order"] if spec.get("panel_order") else spec["panels"]:
        p = spec["panels"][cle]
        verts = np.asarray(p["vertices"], dtype=float)
        aretes = []
        for i, e in enumerate(p["edges"]):
            pts, courbe = echantillonner(verts, e)
            aretes.append(Arete(pts, courbe, (cle, i)))
        piece = Piece(cle, nom_piece(cle), aretes)
        if piece.polygone().exterior.is_ccw is False:
            _inverser(piece)
        out.append(piece)
    return out


def _inverser(piece: Piece) -> None:
    piece.aretes = [Arete(a.pts[::-1].copy(), a.courbe, a.src, a.role, a.lettre) for a in reversed(piece.aretes)]


def _coutures(spec: dict) -> list[tuple[tuple[str, int], tuple[str, int]]]:
    return [((a["panel"], a["edge"]), (b["panel"], b["edge"])) for a, b in spec.get("stitches", [])]


# --- 2. Paires gauche / droite -------------------------------------------------


def _jumeau(cle: str) -> str | None:
    if cle.startswith("left_"):
        return "right_" + cle[5:]
    if cle.endswith("_l"):
        return cle[:-2] + "_r"
    return None


def _droite(a: Arete) -> bool:
    if a.courbe:
        d = a.pts[-1] - a.pts[0]
        n = np.linalg.norm(d)
        if n == 0:
            return False
        ecart = np.abs(np.cross(d, a.pts - a.pts[0])) / n
        return float(ecart.max()) < 0.1
    return True


def reduire_paires(pieces: list[Piece], coutures) -> list[Piece]:
    par_cle = {p.cle: p for p in pieces}
    retirees = set()
    for p in pieces:
        j = _jumeau(p.cle)
        if not j or j not in par_cle:
            continue
        garde = par_cle[j]
        retirees.add(p.cle)
        # Les deux moities se cousent sur UN seul bord droit -> pli (milieu
        # devant). Plusieurs bords ou une courbe (fourche de pantalon) -> paire.
        communs = []
        for a, b in coutures:
            if {a[0], b[0]} == {p.cle, garde.cle}:
                bord = a if a[0] == garde.cle else b
                communs.append(next(x for x in garde.aretes if x.src == bord))
        pli = communs[0] if len(communs) == 1 and _droite(communs[0]) else None
        if pli is not None:
            pli.role = "pli"
            garde.consigne = "Couper 1 au pli"
        else:
            garde.quantite = 2
            garde.consigne = "Couper 2 (en vis-à-vis)"
    return [p for p in pieces if p.cle not in retirees]


# --- 3. Pieces symetriques montrees en moitie ----------------------------------


def moitie_au_pli(piece: Piece, utiles: set | None = None) -> bool:
    """Si la piece est symetrique gauche/droite, ne garder qu'une moitie avec
    un bord « pli » sur l'axe. On garde la moitie ou se trouvent les bords
    `utiles` (ceux qui se cousent a une piece gardee). Rend True si fait."""
    if piece.quantite != 1 or any(a.role == "pli" for a in piece.aretes):
        return False
    poly = piece.polygone()
    if not poly.is_valid or poly.area <= 0:
        return False
    minx, _, maxx, _ = poly.bounds
    cx = (minx + maxx) / 2
    miroir = Polygon(np.column_stack([2 * cx - piece.anneau()[:, 0], piece.anneau()[:, 1]]))
    if not miroir.is_valid or poly.symmetric_difference(miroir).area / poly.area > 0.003:
        return False
    # Fente ou pince sur l'axe (fente milieu dos) : on garde la piece entiere.
    if any(abs(p["sommet"][0] - cx) < 0.5 for p in piece.pinces):
        return False
    essais = [r for r in (_moitie(piece, cx, 1), _moitie(piece, cx, -1)) if r is not None]
    if not essais:
        return False
    utiles = utiles or set()
    garde = lambda aretes: sum(a.longueur for a in aretes if a.src in utiles)  # noqa: E731
    piece.aretes = max(essais, key=garde)
    cote = 1 if np.vstack([a.pts for a in piece.aretes])[:, 0].mean() >= cx else -1
    piece.pinces = [p for p in piece.pinces if (p["sommet"][0] - cx) * cote > 0]
    piece.consigne = "Couper 1 au pli"
    return True


def _moitie(piece: Piece, cx: float, cote: int) -> list[Arete] | None:
    """Aretes de la moitie x > cx (cote = 1) ou x < cx (cote = -1), fermee
    par un bord « pli » sur l'axe ; None si la coupe n'est pas nette."""
    eps = 1e-6
    aretes = piece.aretes
    # Commencer par une arete dont le debut est franchement a gauche.
    k = int(np.argmin([cote * a.pts[0, 0] for a in aretes]))
    aretes = aretes[k:] + aretes[:k]
    chaines: list[list[Arete]] = []
    en_cours: list[Arete] = []
    for a in aretes:
        pts = a.pts
        dedans = cote * (pts[:, 0] - cx) >= -eps
        morceaux: list[list[np.ndarray]] = []
        cour: list[np.ndarray] = []
        for i in range(len(pts)):
            if i > 0 and dedans[i] != dedans[i - 1]:
                p0, p1 = pts[i - 1], pts[i]
                t = (cx - p0[0]) / (p1[0] - p0[0])
                x = p0 + t * (p1 - p0)
                x[0] = cx
                cour.append(x)
                if not dedans[i]:
                    morceaux.append(cour)
                    cour = []
            if dedans[i]:
                cour.append(pts[i])
        if cour:
            morceaux.append(cour)
        for j, m in enumerate(morceaux):
            if len(m) < 2 or np.linalg.norm(np.diff(np.array(m), axis=0), axis=1).sum() < 1e-3:
                continue
            debut_a_gauche = not dedans[0] if j == 0 else True
            if debut_a_gauche and en_cours:
                chaines.append(en_cours)
                en_cours = []
            en_cours.append(Arete(np.array(m), a.courbe, a.src, a.role, a.lettre))
            fin_a_gauche = not dedans[-1] if j == len(morceaux) - 1 else True
            if fin_a_gauche:
                chaines.append(en_cours)
                en_cours = []
    if en_cours:
        chaines.append(en_cours)
    if len(chaines) != 1:
        return None
    chaine = chaines[0]
    debut, fin = chaine[0].pts[0], chaine[-1].pts[-1]
    if abs(debut[0] - cx) > 1e-3 or abs(fin[0] - cx) > 1e-3:
        return None
    chaine.append(Arete(np.array([fin, debut]), False, None, "pli"))
    return chaine


# --- 4. Manche en une piece ----------------------------------------------------


def _transfo(s0, s1, t0, t1, miroir: bool):
    """Fonction qui envoie le segment (s0, s1) sur (t0, t1) (rotation +
    translation, avec symetrie prealable si miroir)."""
    m = np.array([[1.0, 0.0], [0.0, -1.0]]) if miroir else np.eye(2)
    s0m, s1m = m @ s0, m @ s1
    a = math.atan2(*(t1 - t0)[::-1]) - math.atan2(*(s1m - s0m)[::-1])
    r = np.array([[math.cos(a), -math.sin(a)], [math.sin(a), math.cos(a)]])
    rm = r @ m
    return lambda pts: (pts @ rm.T) - (rm @ s0) + t0


def reunir_manches(pieces: list[Piece], coutures) -> list[Piece]:
    par_cle = {p.cle: p for p in pieces}
    retirees = set()
    for p in pieces:
        if not p.cle.endswith("sleeve_f"):
            continue
        b = par_cle.get(p.cle[:-1] + "b")
        if b is None:
            continue
        communs = []
        for x, y in coutures:
            if {x[0], y[0]} == {p.cle, b.cle}:
                ea = next(i for i, a in enumerate(p.aretes) if a.src in (x, y))
                eb = next(i for i, a in enumerate(b.aretes) if a.src in (x, y))
                if _droite(p.aretes[ea]) and _droite(b.aretes[eb]):
                    communs.append((p.aretes[ea].longueur, ea, eb))
        if not communs:
            continue
        _, ea, eb = max(communs)
        A, B = p.aretes[ea], b.aretes[eb]
        # Bords de tete de manche : cousus a une autre piece (l'emmanchure).
        externes = {s for x, y in coutures for s, autre in ((x, y), (y, x))
                    if s[0] in (p.cle, b.cle) and autre[0] not in (p.cle, b.cle)}
        n_a, n_b = len(p.aretes), len(b.aretes)
        # Extremite « epaule » de la ligne commune = celle qui touche la tete.
        debut_a = p.aretes[(ea - 1) % n_a].src in externes  # la tete touche le debut de A
        debut_b = b.aretes[(eb - 1) % n_b].src in externes
        epaule_a, autre_a = (A.pts[0], A.pts[-1]) if debut_a else (A.pts[-1], A.pts[0])
        epaule_b, autre_b = (B.pts[0], B.pts[-1]) if debut_b else (B.pts[-1], B.pts[0])
        meilleur = None
        for miroir in (False, True):
            f = _transfo(epaule_b, autre_b, epaule_a, autre_a, miroir)
            poly_b = Polygon(f(b.anneau()))
            chevauche = p.polygone().intersection(poly_b).area if poly_b.is_valid else 1e9
            if meilleur is None or chevauche < meilleur[0]:
                meilleur = (chevauche, f)
        chevauche, f = meilleur
        if chevauche > 0.5:
            continue  # pas de mise a plat propre : on garde les deux demi-manches
        P = A.pts[0]
        aretes_b = [Arete(f(a.pts), a.courbe, a.src, a.role, a.lettre) for a in b.aretes]
        suite_b = aretes_b[eb + 1:] + aretes_b[:eb]  # de la fin de B au debut de B
        if np.linalg.norm(suite_b[0].pts[0] - P) > 1e-6:  # doit partir de P pour fermer le contour
            suite_b = [Arete(a.pts[::-1].copy(), a.courbe, a.src, a.role, a.lettre) for a in reversed(suite_b)]
        nouvelles = p.aretes[ea + 1:] + p.aretes[:ea] + suite_b
        ancien = p.aretes
        p.aretes = nouvelles
        if not p.polygone().is_valid:
            p.aretes = ancien
            continue
        haut, bas = (epaule_a, autre_a)
        p.reperes.append((np.array([bas, haut]), "milieu de manche = droit-fil"))
        p.droit_fil = math.degrees(math.atan2(*(haut - bas)[::-1]))
        p.cle = p.cle[:-2]
        p.nom = "Manche"
        if p.polygone().exterior.is_ccw is False:
            _inverser(p)
        retirees.add(b.cle)
    return [p for p in pieces if p.cle not in retirees]


# --- 5. Pinces -----------------------------------------------------------------


def reperer_pinces(piece: Piece) -> None:
    """Deux bords droits consecutifs en V etroit, pointe vers l'interieur :
    une pince (ou une fente si tres fine et longue). Le V est remplace par sa
    corde dans le contour ; la pince reste dessinee comme repere."""
    i = 0
    while i < len(piece.aretes) and len(piece.aretes) > 3:
        a, b = piece.aretes[i], piece.aretes[(i + 1) % len(piece.aretes)]
        if a.courbe or b.courbe or a.role or b.role:
            i += 1
            continue
        A, T, B = a.pts[0], a.pts[-1], b.pts[-1]
        la, lb = a.longueur, b.longueur
        if min(la, lb) < 1.0 or abs(la - lb) / max(la, lb) > 0.2:
            i += 1
            continue
        u, v = A - T, B - T
        angle = math.degrees(math.acos(np.clip(np.dot(u, v) / (la * lb), -1, 1)))
        # Pointe vers l'interieur : virage a droite sur un contour direct.
        vers_interieur = np.cross(T - A, B - T) < 0
        if angle < 40 and vers_interieur:
            largeur = float(np.linalg.norm(B - A))
            profondeur = float(np.linalg.norm(T - (A + B) / 2))
            bas = piece.anneau()[:, 1].min()
            fente = largeur < 2.5 and profondeur > 8 and max(abs(A[1] - bas), abs(B[1] - bas)) < 0.5
            piece.pinces.append({"a": A.copy(), "sommet": T.copy(), "b": B.copy(),
                                 "largeur": largeur, "profondeur": profondeur,
                                 "type": "fente" if fente else "pince"})
            corde = Arete(np.array([A, B]), False, a.src, "corde", a.lettre or b.lettre)
            j = (i + 1) % len(piece.aretes)
            if j > i:
                piece.aretes[i:j + 1] = [corde]
            else:
                piece.aretes = [corde] + piece.aretes[1:i]
            continue
        i += 1


# --- 6. Lettres de couture ------------------------------------------------------


def _voisins(p: Piece, i: int, j: int) -> bool:
    """Bords i et j consecutifs sur la piece (en sautant les ouvertures de pince)."""
    n = len(p.aretes)
    for sens in (1, -1):
        k = i
        for _ in range(n):
            k = (k + sens) % n
            if k == j:
                return True
            if p.aretes[k].role != "corde":
                break
    return False


def lettrer_coutures(pieces: list[Piece], coutures) -> list[dict]:
    """Une lettre par couture. GarmentCode decoupe une couture en plusieurs
    bords (cote : hanche + bas ; taille : entre les pinces) : les bords
    consecutifs qui se cousent aux memes pieces sont regroupes sous une seule
    lettre, avec la longueur totale de chaque cote."""
    ou = {}
    for p in pieces:
        for i, a in enumerate(p.aretes):
            if a.src is not None and a.role != "pli":
                ou.setdefault(a.src, (p, i))
    entrees = []
    for x, y in coutures:
        if x not in ou or y not in ou:
            continue
        (p1, i1), (p2, i2) = ou[x], ou[y]
        if p1 is p2 and i1 == i2:
            continue
        entrees.append((p1, i1, p2, i2))

    def lie(e, f) -> bool:
        p1, i1, p2, i2 = e
        q1, j1, q2, j2 = f
        if p1 is q1 and p2 is q2:
            return _voisins(p1, i1, j1) or _voisins(p2, i2, j2)
        if p1 is q2 and p2 is q1:
            return _voisins(p1, i1, j2) or _voisins(p2, i2, j1)
        return False

    groupe = list(range(len(entrees)))

    def racine(k):
        while groupe[k] != k:
            k = groupe[k]
        return k

    for a in range(len(entrees)):
        for b in range(a + 1, len(entrees)):
            if lie(entrees[a], entrees[b]):
                groupe[racine(b)] = racine(a)

    lettres = []
    vus: dict[int, dict] = {}
    for k, (p1, i1, p2, i2) in enumerate(entrees):
        r = racine(k)
        if r not in vus:
            vus[r] = {"lettre": _lettre(len(vus)), "p1": p1, "p2": p2, "c1": set(), "c2": set()}
        g = vus[r]
        if g["p1"] is p1:
            g["c1"].add(i1)
            g["c2"].add(i2)
        else:
            g["c1"].add(i2)
            g["c2"].add(i1)
    for g in vus.values():
        for p, cote in ((g["p1"], g["c1"]), (g["p2"], g["c2"])):
            for i in cote:
                p.aretes[i].lettre = p.aretes[i].lettre or g["lettre"]
        l1 = sum(g["p1"].aretes[i].longueur for i in g["c1"])
        l2 = sum(g["p2"].aretes[i].longueur for i in g["c2"])
        lettres.append({"lettre": g["lettre"], "piece_1": g["p1"].nom, "longueur_1": round(l1, 1),
                        "piece_2": g["p2"].nom, "longueur_2": round(l2, 1),
                        "manche": "Manche" in (g["p1"].nom, g["p2"].nom),
                        "bords": len(g["c1"]) + len(g["c2"])})
    return lettres


def _lettre(n: int) -> str:
    s = ""
    n += 1
    while n:
        n, r = divmod(n - 1, 26)
        s = chr(65 + r) + s
    return s


# --- 7. Valeur de couture -------------------------------------------------------


def ligne_de_coupe(piece: Piece, valeur_cm: float) -> np.ndarray:
    poly = piece.polygone()
    if not poly.is_valid:
        poly = poly.buffer(0)
    coupe = poly.buffer(valeur_cm, join_style=2, mitre_limit=2.5)
    for a in piece.aretes:
        if a.role != "pli":
            continue
        p, q = a.pts[0], a.pts[-1]
        d = (q - p) / np.linalg.norm(q - p)
        n = np.array([-d[1], d[0]])  # a gauche du bord = interieur (contour direct)
        grand = 1e4
        demi_plan = Polygon([p - d * grand, q + d * grand, q + d * grand + n * grand, p - d * grand + n * grand])
        coupe = coupe.intersection(demi_plan)
    if coupe.geom_type != "Polygon":
        coupe = unary_union(coupe).convex_hull if coupe.is_empty is False else poly
    return np.asarray(coupe.exterior.coords)


# --- Mise a plat finale -----------------------------------------------------------


def redresser(piece: Piece) -> None:
    """Droit-fil vertical, coin bas-gauche de la ligne de coupe en (0, 0)."""
    a = math.radians(90.0 - piece.droit_fil)
    if abs(a) > 1e-6:
        r = np.array([[math.cos(a), -math.sin(a)], [math.sin(a), math.cos(a)]])
        piece.appliquer(lambda pts: pts @ r.T)
        piece.droit_fil = 90.0
    ref = piece.coupe if piece.coupe is not None else piece.anneau()
    mn = ref.min(axis=0)
    piece.appliquer(lambda pts: pts - mn)


def rectangle(cle: str, nom: str, largeur_cm: float, hauteur_cm: float, quantite: int = 1,
              consigne: str | None = None, valeur_couture_cm: float = 1.0, pli: bool = False) -> Piece:
    """Piece rectangulaire cotee (col, poignet, patte, panneau d'apercu), prete
    a dessiner : ligne de coupe calculee, coin bas-gauche en (0, 0). `pli` :
    le bord gauche est une pliure (la piece est montree en moitie)."""
    w, h = float(largeur_cm), float(hauteur_cm)
    coins = [(0.0, 0.0), (w, 0.0), (w, h), (0.0, h)]  # sens direct
    aretes = [Arete(np.array([coins[i], coins[(i + 1) % 4]], dtype=float), False) for i in range(4)]
    if pli:
        aretes[3].role = "pli"  # (0, h) -> (0, 0)
    piece = Piece(cle, nom, aretes, quantite, consigne or (f"Couper {quantite}" if not pli else "Couper 1 au pli"))
    piece.coupe = ligne_de_coupe(piece, valeur_couture_cm)
    redresser(piece)
    return piece


def ouvrir_pli(piece: Piece, croisure_cm: float, valeur_couture_cm: float = 1.0) -> np.ndarray | None:
    """Transforme le bord « pli » d'une piece en bord de coupe deporte de
    `croisure_cm` vers l'exterieur (devant de chemise : milieu devant +
    croisure). Rend le segment de l'ancien pli (le milieu devant, a reporter),
    ou None si la piece n'a pas de pli."""
    i = next((k for k, a in enumerate(piece.aretes) if a.role == "pli"), None)
    if i is None:
        return None
    pli = piece.aretes[i]
    p, q = pli.pts[0].copy(), pli.pts[-1].copy()
    d = (q - p) / np.linalg.norm(q - p)
    dehors = np.array([d[1], -d[0]])  # a droite du bord = exterieur (contour direct)
    p2, q2 = p + dehors * croisure_cm, q + dehors * croisure_cm
    piece.aretes[i:i + 1] = [
        Arete(np.array([p, p2]), False, pli.src),
        Arete(np.array([p2, q2]), False, pli.src),
        Arete(np.array([q2, q]), False, pli.src),
    ]
    piece.coupe = ligne_de_coupe(piece, valeur_couture_cm)
    redresser(piece)
    # L'ancien pli a bouge avec la piece (redresser) : il va du debut du
    # premier raccord a la fin du second.
    return np.array([piece.aretes[i].pts[0], piece.aretes[i + 2].pts[-1]])


def preparer(spec: dict, valeur_couture_cm: float = 1.0) -> tuple[list[Piece], list[dict]]:
    coutures = _coutures(spec)
    pieces = pieces_depuis_spec(spec)
    pieces = reduire_paires(pieces, coutures)
    pieces = reunir_manches(pieces, coutures)
    gardees = {a.src for p in pieces for a in p.aretes if a.src}
    proprio = {a.src: p.cle for p in pieces for a in p.aretes if a.src}
    for p in pieces:
        reperer_pinces(p)
        # Bords de p qui se cousent a une AUTRE piece gardee.
        utiles = {x for x, y in coutures for x, y in ((x, y), (y, x))
                  if proprio.get(x) == p.cle and y in gardees and proprio.get(y) != p.cle}
        moitie_au_pli(p, utiles)
    lettres = lettrer_coutures(pieces, coutures)
    for p in pieces:
        p.coupe = ligne_de_coupe(p, valeur_couture_cm)
        redresser(p)
    return pieces, lettres
