"""Normalisation des numeros de telephone (mission Agent A, A1.4).

Le serveur compare les numeros sous forme de chaine exacte, ce qui rejetait
des saisies pourtant legitimes : espaces ou tirets, un « 00 » au lieu du
« + », un indicatif saisi deux fois, ou un 0 devant le numero local. Toute
entree utilisateur (inscription, connexion, reinitialisation, creation de
membre d'equipe, agent de collecte) passe donc par `normalize_phone`.

Regles appliquees, dans l'ordre :
1. on retire espaces, tirets, points, parentheses, barres ;
2. « 00 » en tete devient « + » (00237... -> +237...) ;
3. un indicatif camerounais double est reduit (237237... -> 237...) ;
4. sans indicatif, un numero local camerounais (9 chiffres commencant
   par 6 ou 2, avec ou sans 0 initial) reçoit le prefixe +237 ;
5. tout autre nombre (indicatif etranger) est uniformise en « + » + chiffres.

Le resultat est idempotent : normaliser un numero deja normalise ne le
change pas.
"""

import re

# Indicatif telephonique du Cameroun, sans le « + » (utilise sur les chiffres).
CAM_DIAL = "237"
# 9 chiffres commencant par 6 ou 2 (numeros portables et fixes locaux).
CAM_LOCAL_RE = re.compile(r"[62]\d{8}$")


def normalize_phone(raw: str | None) -> str:
    """Renvoie le numero normalise (toujours une chaine, vide si rien a lier)."""
    if raw is None:
        return ""
    s = raw.strip()
    if not s:
        return ""
    # 1. caracteres de mise en forme retires, chiffres conserves.
    s = re.sub(r"[\s\-.()/]+", "", s)
    has_plus = s.startswith("+")
    digits = re.sub(r"\D", "", s)
    if not digits:
        return ""
    # 2. « 00 » en tete equivaut a « + ».
    has_plus = has_plus or digits.startswith("00")
    if digits.startswith("00"):
        digits = digits[2:]
    if not digits:
        return ""
    # 3. indicatif camerounais double : 237237... -> 237...
    if digits.startswith(CAM_DIAL) and len(digits) >= 3 + 3 and digits[3:6] == CAM_DIAL:
        digits = digits[3:]
    if digits.startswith(CAM_DIAL):
        # Numero ecrit avec l'indicatif 237 (+237..., 00237..., 237...) : le
        # garder tel quel, meme si la forme locale paraît inhabituelle.
        return "+" + digits
    if not has_plus:
        # 4. numero local camerounais (0 initial ou non) sans indicatif.
        if digits.startswith("0") and CAM_LOCAL_RE.match(digits[1:]):
            return "+" + CAM_DIAL + digits[1:]
        if CAM_LOCAL_RE.match(digits):
            return "+" + CAM_DIAL + digits
    # 5. indication international (ou forme ambigue) : uniformiser en +chiffres.
    return "+" + digits