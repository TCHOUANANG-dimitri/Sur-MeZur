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


def compute_escrow_split(total: float) -> EscrowSplit:
    return EscrowSplit(
        total=round(total, 2),
        deposit_70=round(total * 0.7, 2),
        tailor_immediate_40=round(total * 0.4, 2),
        escrow_30=round(total * 0.3, 2),
        balance_30=round(total * 0.3, 2),
    )
