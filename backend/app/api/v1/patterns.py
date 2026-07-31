from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.v1.order_helpers import require_order_participant
from app.core.deps import get_db
from app.models.catalog import GarmentModel
from app.models.enums import PaymentPhase, PaymentStatus
from app.models.measurements import Measurement
from app.models.misc import Pattern
from app.models.payments import Payment
from app.schemas.misc import PatternOut
from app.services.mock_ai import generate_pattern_svg

router = APIRouter(prefix="/orders/{order_id}/pattern", tags=["patterns"])


@router.get("", response_model=PatternOut)
def get_pattern(
    order_and_user: tuple = Depends(require_order_participant), db: Session = Depends(get_db)
):
    order, _ = order_and_user

    # RG-07: le patron n'est transmis qu'après validation + versement des 70 %.
    deposit_paid = (
        db.query(Payment)
        .filter(
            Payment.order_id == order.id,
            Payment.phase == PaymentPhase.deposit_70,
            Payment.status == PaymentStatus.paid,
        )
        .first()
    )
    if not deposit_paid:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Pattern released only after the deposit is paid")

    existing = db.query(Pattern).filter(Pattern.order_id == order.id).first()
    if existing:
        return existing

    measurement = db.get(Measurement, order.measurement_id)
    category = "top"
    if order.garment_model_id:
        model = db.get(GarmentModel, order.garment_model_id)
        if model:
            category = model.category.value if hasattr(model.category, "value") else model.category

    svg_url, tech_sheet = generate_pattern_svg(order.id, category, measurement.data if measurement else {})
    pattern = Pattern(
        order_id=order.id,
        svg_url=svg_url,
        pdf_url=None,
        tech_sheet=tech_sheet,
        source="freesewing",
        sent_at=datetime.now(timezone.utc),
    )
    db.add(pattern)
    db.commit()
    db.refresh(pattern)
    return pattern
