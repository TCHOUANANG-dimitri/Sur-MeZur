import enum


class UserRole(str, enum.Enum):
    client = "client"
    tailor = "tailor"
    admin = "admin"


class TailorType(str, enum.Enum):
    individual = "individual"
    atelier = "atelier"


class VerificationStatus(str, enum.Enum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"


class MeasurementSource(str, enum.Enum):
    ai = "ai"
    manual = "manual"
    mixed = "mixed"
    tailor_confirmed = "tailor_confirmed"


class JobStatus(str, enum.Enum):
    processing = "processing"
    ready = "ready"
    failed = "failed"


class OrderType(str, enum.Enum):
    custom = "custom"
    ready_to_wear = "ready_to_wear"


class OrderStatus(str, enum.Enum):
    new = "new"
    in_progress = "in_progress"
    finished_delivered = "finished_delivered"
    finished_not_delivered = "finished_not_delivered"


class OrderPriority(str, enum.Enum):
    low = "low"
    normal = "normal"
    high = "high"


class ReceptionMode(str, enum.Enum):
    pickup = "pickup"
    delivery = "delivery"


class OfferActor(str, enum.Enum):
    client = "client"
    tailor = "tailor"


class OfferStatus(str, enum.Enum):
    pending = "pending"
    accepted = "accepted"
    refused = "refused"
    expired = "expired"


class ModificationStatus(str, enum.Enum):
    proposed = "proposed"
    accepted = "accepted"
    refused = "refused"


class ChatMessageType(str, enum.Enum):
    text = "text"
    modification = "modification"
    system = "system"


class PaymentPhase(str, enum.Enum):
    deposit_70 = "deposit_70"
    balance_30 = "balance_30"


class PaymentStatus(str, enum.Enum):
    pending = "pending"
    paid = "paid"
    released = "released"
    refunded = "refunded"
    failed = "failed"


class EscrowStatus(str, enum.Enum):
    held = "held"
    released = "released"
    refunded = "refunded"


class MobileMoneyProvider(str, enum.Enum):
    mtn_momo = "mtn_momo"
    orange_money = "orange_money"


class GarmentCategory(str, enum.Enum):
    top = "top"
    bottom = "bottom"
    dress = "dress"
    traditional = "traditional"
    other = "other"


class AssetType(str, enum.Enum):
    mhclo = "mhclo"
    gltf = "gltf"
    texture = "texture"
    thumbnail = "thumbnail"
    pattern_svg = "pattern_svg"
    pattern_pdf = "pattern_pdf"


class Language(str, enum.Enum):
    fr = "fr"
    en = "en"


class MeasurementMethod(str, enum.Enum):
    ai = "ai"
    standard = "standard"
    manual = "manual"


class ModerationStatus(str, enum.Enum):
    visible = "visible"
    flagged = "flagged"
    hidden = "hidden"


class DisputeStatus(str, enum.Enum):
    open = "open"
    resolved_client = "resolved_client"
    resolved_tailor = "resolved_tailor"
    dismissed = "dismissed"
