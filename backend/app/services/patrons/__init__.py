"""Generation de patrons « garmentcode-v1 ».

- catalogue.py : categories fixes (IA, app, patrons), modeles de base, styles ;
- corps.py     : nos mesures -> mesures du corps GarmentCode ;
- moteur.py    : base + style + mesures -> GarmentCode -> pieces + controles ;
- geometrie.py : panneaux GarmentCode -> pieces de coupe (pli, manche, pinces) ;
- export.py    : SVG, PDF 1:1 (A4 ou pleine page), fiche de tracage cotee.
"""

from .catalogue import BASE_PAR_DEFAUT, BASES_PAR_ID, catalogue_public  # noqa: F401
from .moteur import MOTEUR, PatronImpossible, fichiers, generer  # noqa: F401
