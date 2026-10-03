"""
Le modele-pivot : un corps Anny dont les parametres sont optimisables.

On passe par clad-body (`load_anny_from_params`) pour construire le modele :
c'est le MEME corps, dans la MEME pose A (bras a -45°), que celui sur lequel
clad-body lit ensuite les mensurations ISO 8559-1. L'ajustement et la mesure
portent donc exactement sur le meme maillage.

Parametres libres :
  - phenotype Anny (dans [0,1]) : taille, poids, musculature, proportions,
    et pour les femmes poitrine/fermete. Le sexe est fixe (connu) ; l'age et
    les poids d'origine sont fixes (a priori de population, voir config).
  - changements locaux « measure-* » (dans [-1,1]) : tour de poitrine, de
    taille, de hanches, de cuisse, de bras, longueurs de segments...
Ils sont optimises dans un espace non borne (logit / atanh) pour que
l'optimiseur ne sorte jamais du domaine valide.

Convention de repere (clad-body) : Z vers le haut, metres. Les axes
lateral et avant-arriere sont determines a l'execution, a partir des points
clés des epaules (voir `_axes`).
"""

from __future__ import annotations

import math

import torch

from . import compat  # noqa: F401  (doit preceder tout usage de clad-body)
from . import config


def _logit(p: float) -> float:
    p = min(max(p, 1e-4), 1 - 1e-4)
    return math.log(p / (1 - p))


def _atanh(x: float) -> float:
    x = min(max(x, -0.999), 0.999)
    return 0.5 * math.log((1 + x) / (1 - x))


class CorpsAnny:
    def __init__(self, phenotypes: dict[str, float], locaux: list[str]):
        from anny.keypoints import KeypointsRegressor
        from clad_body.load.anny import build_anny_apose, load_anny_from_params

        params = dict(phenotypes)
        params["_local_changes"] = {lab: 0.0 for lab in locaux}
        self.body = load_anny_from_params(params, requires_grad=False)
        self.model = self.body.model
        self.apose = build_anny_apose(self.model, torch.device("cpu"))
        self.locaux = list(locaux)
        self.labels_pheno = list(self.model.phenotype_labels)
        self.coco = KeypointsRegressor.coco(self.model)
        self.coco_index = {lab: i for i, lab in enumerate(self.coco.labels)}

        # Valeurs courantes, dans l'espace non borne.
        self.brut_pheno = {
            lab: torch.tensor([_logit(phenotypes[lab])], dtype=torch.float32, requires_grad=True)
            for lab in self.labels_pheno
            if lab in phenotypes
        }
        self.brut_local = {
            lab: torch.tensor([0.0], dtype=torch.float32, requires_grad=True) for lab in locaux
        }
        self._masque_tronc = None
        self._axes_cache = None
        self._haut = None

    # --- parametres ---------------------------------------------------------
    def pheno(self) -> dict[str, torch.Tensor]:
        return {lab: torch.sigmoid(v) for lab, v in self.brut_pheno.items()}

    def local(self) -> dict[str, torch.Tensor]:
        return {lab: torch.tanh(v) for lab, v in self.brut_local.items()}

    def parametres(self, libres_pheno: list[str], avec_locaux: bool) -> list[torch.Tensor]:
        out = [self.brut_pheno[lab] for lab in libres_pheno if lab in self.brut_pheno]
        if avec_locaux:
            out += list(self.brut_local.values())
        return out

    def valeurs(self) -> dict:
        """Parametres courants, lisibles (pour la sauvegarde et la mesure)."""
        d = {lab: round(float(v), 4) for lab, v in self.pheno().items()}
        d["_local_changes"] = {lab: round(float(v), 4) for lab, v in self.local().items()}
        return d

    # --- passe avant --------------------------------------------------------
    def passe(self) -> dict:
        """Corps en POSE DE REPOS, pour l'ajustement.

        Seule la forme est optimisee, et tout ce que le cout compare est
        independant de la pose : taille, masse (volume), tranches du tronc
        (bras exclus), longueurs de segments. La pose de repos est une simple
        combinaison lineaire de formes (`get_rest_vertices`), sans squelette ni
        skinning : mesure sur ce poste, la passe complete en pose A coutait
        4 s + 16 s de retropropagation par etape, ce qui mettait 20 sujets a
        ~18 h. La pose A ne sert qu'une fois, pour l'extraction (`passe_apose`).
        """
        m = self.model
        _, ph, lc, fa = m.get_tensor_inputs(None, self.pheno(), self.local(), None)
        coeffs = m._get_phenotype_blendshape_coefficients(ph, lc, fa)
        v = m.get_rest_vertices(coeffs)  # (1, V, 3) metres
        if self._haut is None:
            # Axe vertical = plus grande etendue (le repos MakeHuman est en
            # Y vers le haut, la sortie posee de clad-body en Z).
            ext = (v[0].max(0).values - v[0].min(0).values).detach()
            self._haut = int(torch.argmax(ext))
        if self._haut == 1:  # Y-up -> Z-up, meme transformation que clad-body
            v = torch.stack([v[..., 0], -v[..., 2], v[..., 1]], dim=-1)
        zero = v.new_zeros(())
        v = v - torch.stack([zero, zero, v[0, :, 2].min()])
        out = {"vertices": v}
        out["coco"] = self.coco({"vertices": v})  # (1, K, 3)
        return out

    @torch.no_grad()
    def passe_apose(self) -> dict:
        """Corps en pose A (bras a -45°), sortie brute du modele : c'est le
        corps sur lequel clad-body lit les mesures ISO."""
        return self.model(
            pose_parameters=self.apose,
            phenotype_kwargs={k: v.detach() for k, v in self.pheno().items()},
            local_changes_kwargs={k: v.detach() for k, v in self.local().items()},
            pose_parameterization="local-bone",
            return_bone_ends=True,
        )

    def point(self, out: dict, label: str) -> torch.Tensor:
        return out["coco"][0, self.coco_index[label]]

    # --- reperes ------------------------------------------------------------
    def _axes(self, out: dict) -> tuple[int, int]:
        """(axe lateral, axe avant-arriere). Lateral = celui qui separe le plus
        les deux epaules ; l'autre axe horizontal est l'avant-arriere."""
        if self._axes_cache is None:
            d = (self.point(out, "left_shoulder") - self.point(out, "right_shoulder")).abs()
            lat = int(torch.argmax(d[:2]))
            self._axes_cache = (lat, 1 - lat)
        return self._axes_cache

    def masque_tronc(self) -> torch.Tensor:
        """Sommets hors bras et mains : leur os dominant n'est pas un os du
        membre superieur. Meme role que la bande d'exclusion des bras de la
        production (_mask_without_arms) : les largeurs comparees sont celles
        du tronc seul."""
        if self._masque_tronc is None:
            w = self.model.vertex_bone_weights
            idx = self.model.vertex_bone_indices
            dominant = idx.gather(-1, w.argmax(dim=-1, keepdim=True)).squeeze(-1)
            labels = [str(b).lower() for b in self.model.bone_labels]
            bras = torch.tensor(
                [any(k in lab for k in config.MOTS_OS_BRAS) for lab in labels], dtype=torch.bool
            )
            self._masque_tronc = ~bras[dominant]
        return self._masque_tronc

    def tranches(self, out: dict, fractions: list[float], axe: str) -> torch.Tensor:
        """Largeur (axe='lateral') ou profondeur (axe='avant') du tronc, en cm,
        aux fractions donnees de la hauteur epaules -> hanches (points COCO).

        Extremums « doux » (log-somme-exp) pour que le gradient circule vers
        tous les sommets du bord, et pas seulement vers le plus extreme."""
        v = out["vertices"][0]
        lat, avant = self._axes(out)
        col = lat if axe == "lateral" else avant
        tronc = v[self.masque_tronc()]
        z_ep = (self.point(out, "left_shoulder")[2] + self.point(out, "right_shoulder")[2]) / 2
        z_ha = (self.point(out, "left_hip")[2] + self.point(out, "right_hip")[2]) / 2
        beta = config.DOUCEUR_EXTREMUM
        res = []
        for f in fractions:
            z = z_ep + f * (z_ha - z_ep)
            sel = (tronc[:, 2] - z).abs() < config.DEMI_EPAISSEUR_TRANCHE_M
            pts = tronc[sel][:, col]
            if pts.numel() < 4:
                res.append(torch.tensor(float("nan")))
                continue
            hi = torch.logsumexp(beta * pts, 0) / beta
            lo = -torch.logsumexp(-beta * pts, 0) / beta
            res.append((hi - lo) * 100.0)
        return torch.stack(res)

    def hauteur_cm(self, out: dict) -> torch.Tensor:
        v = out["vertices"][0]
        return (v[:, 2].max() - v[:, 2].min()) * 100.0

    def masse_kg(self, out: dict) -> torch.Tensor:
        """Volume du maillage ferme (somme de tetraedres signes) x densite."""
        v = out["vertices"][0]
        f = self.model.faces.long()
        v0, v1, v2 = v[f[:, 0]], v[f[:, 1]], v[f[:, 2]]
        vol = (torch.cross(v0, v1, dim=-1) * v2).sum(-1).sum().abs() / 6.0
        return vol * config.DENSITE_KG_M3
