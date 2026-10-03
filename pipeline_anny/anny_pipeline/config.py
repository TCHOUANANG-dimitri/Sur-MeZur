"""
Reglages de la nouvelle chaine (Anny). Regroupes ici pour que chaque valeur
soit visible et justifiable, et que les essais se fassent sans toucher au code.
"""

# --- A priori de population (modele-pivot) ----------------------------------
# Phenotypes Anny, dans [0,1]. Age : ancres newborn, baby, child, young, old
# placees a -1/3, 0, 1/3, 2/3, 1 ; 0,72 = jeune adulte (0,5 serait un
# adolescent). Les sujets pilotes n'ont pas d'age saisi. Les poids d'origine
# placent l'a priori sur la morphologie africaine, notre marche (§1 de la
# specification : « morphologies africaines »). Ils restent FIXES : ils
# modelent surtout le visage et les proportions fines, et les laisser libres
# donnerait a l'optimiseur un levier sans rapport avec les observations.
PHENOTYPE_INITIAL = {
    "age": 0.72,
    "muscle": 0.5,
    "weight": 0.5,
    "height": 0.5,
    "proportions": 0.5,
    "cupsize": 0.5,
    "firmness": 0.5,
    "african": 1.0,
    "asian": 0.0,
    "caucasian": 0.0,
}

# Changements locaux « measure-* » d'Anny (cibles MakeHuman), dans [-1,1].
# Ce sont les leviers que la voie A ajuste pour coller aux photos.
#
# SEULS les leviers qu'une observation contraint sont libres : le tronc (vu
# en largeur et en profondeur) et les longueurs (vues par les landmarks).
# Les tours de cou, de bras et de cuisse ne sont vus par AUCUNE observation :
# les laisser libres permettait a l'optimiseur de les faire fondre pour
# tenir la masse (constate sur orig-1 : cuisse -10,7 cm, bras -7,9 cm). Ils
# viennent donc de l'a priori du modele, comme le prevoit la specification.
LOCAUX = [
    "measure-bust-circ-incr",
    "measure-underbust-circ-incr",
    "measure-waist-circ-incr",
    "measure-hips-circ-incr",
    "measure-shoulder-dist-incr",
    "measure-frontchest-dist-incr",
    "measure-napetowaist-dist-incr",
    "measure-waisttohip-dist-incr",
    "measure-upperarm-length-incr",
    "measure-lowerarm-length-incr",
    "measure-upperleg-height-incr",
    "measure-lowerleg-height-incr",
]

# Os du membre superieur (sous-chaines des libelles Anny) : leurs sommets sont
# exclus des tranches du tronc.
MOTS_OS_BRAS = ("upperarm", "lowerarm", "hand", "finger", "thumb", "metacarpal", "wrist")

# --- Geometrie des tranches -------------------------------------------------
DEMI_EPAISSEUR_TRANCHE_M = 0.008   # +/- 8 mm autour de la hauteur visee
DOUCEUR_EXTREMUM = 300.0           # 1/m : extremum doux a ~3 mm pres

# Masse : volume du maillage x densite. On prend la densite d'Anny lui-meme
# (anny/anthropometry.py : 980 kg/m3), celle avec laquelle son a priori de
# poids a ete construit. Avec 1010 (valeur de la production), le corps Anny
# le plus maigre de 182 cm pesait deja 72 kg : un sujet de 68 kg devenait
# inatteignable et l'optimiseur compensait n'importe ou.
DENSITE_KG_M3 = 980.0

# --- Voie B (initialisation) ------------------------------------------------
# Sans regresseur photo disponible (voir README), l'initialisation ajuste
# uniquement les phenotypes taille et poids pour reproduire la taille et le
# poids mesures : c'est l'a priori anthropometrique d'Anny pour ce gabarit.
INIT_ETAPES = 150
INIT_LR = 0.1

# --- Voie A (ajustement) ----------------------------------------------------
AJUST_ETAPES = 160
AJUST_LR = 0.05
PHENO_LIBRES = ["height", "weight", "muscle", "proportions"]
PHENO_LIBRES_FEMME = ["cupsize", "firmness"]

# Ecarts-types des termes du cout (en cm, kg, ou unites de parametre).
SIGMA_TAILLE_CM = 0.5
SIGMA_MASSE_KG = 1.5
# Silhouette comme BORNE (§4.2) : depasser la silhouette observee coute cher
# (le corps ne peut pas etre plus large que ce qu'on voit) ; rester en deca
# coute peu (le vetement ajoute de l'epaisseur), au-dela d'une tolerance.
SIGMA_DEPASSE_CM = 1.0
SIGMA_EN_DECA_CM = 3.0
TOLERANCE_VETEMENT_CM = 0.5
SIGMA_LONGUEUR_CM = 2.0
# Une longueur observee qui s'ecarte de plus de 15 % de celle du corps a
# priori est ecartee (et consignee) : c'est un artefact de prise de vue, pas
# une morphologie. Cas type : le tibia vu raccourci en bas de l'image quand
# le telephone est a hauteur de taille (36 cm mesures pour ~45 attendus a
# 182 cm sur orig-1).
ECART_MAX_LONGUEUR = 0.15
POIDS_LONGUEURS = 0.5
SIGMA_PHENO = 0.20
SIGMA_LOCAL = 0.5
