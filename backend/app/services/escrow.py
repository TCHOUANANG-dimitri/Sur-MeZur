"""70/30 escrow split per CDC §4.8 / §10.2.

Example (50 000 FCFA order): deposit_70=35 000 (=tailor_immediate_40 20 000 +
escrow_30 15 000); balance_30=15 000 paid at delivery, at which point the
escrowed 15 000 is released too -> tailor receives 30 000 at delivery.
"""

from dataclasses import dataclass


@dataclass
class EscrowSplit:
    total: float
    deposit_70: float
    tailor_immediate_40: float
    escrow_30: float
    balance_30: float


def shares() -> tuple[float, float]:
    """Part de l'acompte et part versee tout de suite au tailleur, reglables
    depuis l'administration (13.7). Les noms de colonnes gardent 70/40/30,
    valeurs d'origine."""
    from app.services.platform_settings import get_setting

    deposit = float(get_setting("deposit_share") or 0.7)
    immediate = float(get_setting("tailor_immediate_share") or 0.4)
    deposit = min(max(deposit, 0.0), 1.0)
    immediate = min(max(immediate, 0.0), deposit)
    return deposit, immediate


def compute_escrow_split(total: float) -> EscrowSplit:
    deposit, immediate = shares()
    return EscrowSplit(
        total=round(total, 2),
        deposit_70=round(total * deposit, 2),
        tailor_immediate_40=round(total * immediate, 2),
        escrow_30=round(total * (deposit - immediate), 2),
        balance_30=round(total * (1 - deposit), 2),
    )
