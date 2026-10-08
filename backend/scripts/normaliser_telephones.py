"""
Normalise les numeros de telephone deja en base (voir A1.4).

Depuis la mise en place de `app/services/phone.py`, les nouvelles entres sont
normalisees a l'inscription, a la connexion et a la creation de membre
d'equipe / agent de collecte. Ce script rattrape les comptes existants qui ont
ete crees avec une forme non canonique (+237... ecrit avec espaces, 00237...,
2376... sans le +, 0 initial, indicatif double...).

Seule la forme STOCKEE change : le numero de telephone de l'utilisateur. Le
comportement (connexion, notifications) est identique, puisque les entrees
sont normalisees avant toute comparaison.

Il ne fusionne JAMAIS deux comptes : si la normalisation fait tomber deux
comptes sur le meme numero, les deux sont signales comme « doublon probable »
et aucun des deux n'est modifie. La fusion est une decision humaine via
`app/services/account_tools.py` ou l'ecran administrateur.

Usage (despuis backend/) :
    ./venv/Scripts/python.exe scripts/normaliser_telephones.py        # apercu
    ./venv/Scripts/python.exe scripts/normaliser_telephones.py --apply  # ecrit
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.db.base import SessionLocal  # noqa: E402
from app.models.users import User  # noqa: E402
from app.services.phone import normalize_phone  # noqa: E402


def main() -> None:
    appliquer = "--apply" in sys.argv
    with SessionLocal() as db:
        users = (
            db.query(User)
            .filter(User.is_guest.is_(False), User.phone.notlike("guest-%"))
            .order_by(User.created_at)
            .all()
        )
        # Doublons crees par la normalisation : numero normalise -> comptes.
        see: dict[str, list[User]] = {}
        for u in users:
            norm = normalize_phone(u.phone)
            if norm:
                see.setdefault(norm, []).append(u)

        changes = 0
        doublons = 0
        for u in users:
            current = u.phone
            norm = normalize_phone(current)
            if not norm or norm == current:
                continue
            # Deja porte par un AUTRE compte -> danger de collision, on ne
            # modifie ni l'un ni l'autre.
            porteurs = [p for p in see.get(norm, []) if p.id != u.id]
            if porteurs:
                doublons += 1
                print(f"  DOUBLON : {current!r} -> {norm} (deja {porteurs[0].phone!r}, id {porteurs[0].id})")
                continue
            print(f"  {current!r} -> {norm}")
            changes += 1
            if appliquer:
                u.phone = norm
        if appliquer:
            db.commit()
        print(
            f"{changes} numero(s) a normaliser, {doublons} doublon(s) signale(s)"
            + (" (rien n'a ete ecrit, options --apply)" if not appliquer else "")
        )
    sys.exit(0)


if __name__ == "__main__":
    main()