"""Stand-ins for the real AI microservices described in doc 3/4 (measurements via
MediaPipe+SAM+ANSUR regression, avatar via MakeHuman/MPFB, garment fitting via
MPFB refit + Blender, pattern draft via Freesewing). Confirmed scope decision:
pure mocks, deterministic-but-plausible, behind the same API contracts so the
real pipelines can be dropped in later without touching callers.
"""

import os
import random

from app.core.config import settings

# Ratio of each cote to height_cm, tuned to look like a plausible adult body.
_LENGTH_RATIOS = {
    "shoulder": 0.235,
    "sleeve": 0.305,
    "back_length": 0.255,
    "inseam": 0.455,
    "outseam": 0.605,
}
_CIRCUMFERENCE_RATIOS = {
    "neck": 0.215,
    "chest": 0.535,
    "waist": 0.455,
    "hips": 0.565,
    "biceps": 0.165,
    "wrist": 0.095,
    "thigh": 0.305,
    "ankle": 0.135,
}


def generate_measurements(height_cm: float, weight_kg: float | None, gender: str | None) -> tuple[dict, dict]:
    weight = weight_kg or (0.9 * (height_cm - 100))  # rough Broca estimate if omitted
    bmi = weight / ((height_cm / 100) ** 2)
    bmi_factor = max(0.85, min(1.25, bmi / 22.0))
    gender_factor = 1.03 if (gender or "").lower().startswith("m") else 0.98

    data: dict[str, float] = {}
    confidence: dict[str, float] = {}

    for key, ratio in _LENGTH_RATIOS.items():
        jitter = 1 + random.uniform(-0.02, 0.02)
        data[key] = round(height_cm * ratio * gender_factor * jitter, 1)
        confidence[key] = round(random.uniform(0.85, 0.96), 2)

    for key, ratio in _CIRCUMFERENCE_RATIOS.items():
        jitter = 1 + random.uniform(-0.02, 0.02)
        data[key] = round(height_cm * ratio * bmi_factor * gender_factor * jitter, 1)
        confidence[key] = round(random.uniform(0.75, 0.92), 2)

    data["height_total"] = height_cm
    return data, confidence


def generate_avatar_reference(avatar_id: str) -> str:
    """Placeholder 'asset' the frontend Viewer3D interprets procedurally
    (skin tone + body proportions), rather than loading a real glTF mesh."""
    return f"mock-asset://avatar/{avatar_id}"


def generate_tryon_reference(tryon_id: str) -> str:
    return f"mock-asset://tryon/{tryon_id}"


_PATTERN_PIECES = {
    "top": [("Devant", "chest", "back_length"), ("Dos", "chest", "back_length"), ("Manche", "biceps", "sleeve")],
    "bottom": [("Devant jambe", "thigh", "outseam"), ("Dos jambe", "thigh", "outseam"), ("Ceinture", "waist", None)],
    "dress": [("Devant", "chest", "outseam"), ("Dos", "chest", "outseam"), ("Manche", "biceps", "sleeve")],
    "traditional": [("Panneau avant", "chest", "outseam"), ("Panneau arrière", "chest", "outseam")],
    "other": [("Panneau", "chest", "back_length")],
}


def generate_pattern_svg(order_id: str, category: str, measurements: dict, ease_cm: float = 4.0) -> tuple[str, dict]:
    """Draws a schematic (not couture-accurate) SVG of labeled pattern pieces
    sized from the mock measurements -- enough to demonstrate the
    fiche-technique-first MVP approach from doc 4 §D.6 without a real
    Freesewing/@freesewing-core draft."""
    pieces = _PATTERN_PIECES.get(category, _PATTERN_PIECES["other"])
    x_cursor = 20
    svg_parts = [
        '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="420" '
        'viewBox="0 0 900 420" font-family="sans-serif">',
        '<rect width="900" height="420" fill="#FAF9FC"/>',
        f'<text x="20" y="24" font-size="16" fill="#1F2A44" font-weight="bold">'
        f"Patron (fiche technique) — commande {order_id[:8]}</text>",
    ]
    tech_sheet: dict = {"category": category, "ease_cm": ease_cm, "pieces": []}

    for label, width_key, height_key in pieces:
        width_cm = measurements.get(width_key, 40) / 2 + ease_cm
        height_cm = measurements.get(height_key, 60) if height_key else 12
        px_w = max(40, min(220, width_cm * 3))
        px_h = max(40, min(320, height_cm * 3))
        svg_parts.append(
            f'<rect x="{x_cursor}" y="60" width="{px_w:.0f}" height="{px_h:.0f}" '
            f'fill="#EDEAF4" stroke="#5B21B6" stroke-width="2" rx="6"/>'
        )
        svg_parts.append(
            f'<text x="{x_cursor + 6}" y="80" font-size="12" fill="#1F2A44">{label}</text>'
        )
        svg_parts.append(
            f'<text x="{x_cursor + 6}" y="{60 + px_h - 8:.0f}" font-size="11" fill="#6B7280">'
            f"{width_cm:.1f}cm x {height_cm:.1f}cm</text>"
        )
        tech_sheet["pieces"].append(
            {"label": label, "width_cm": round(width_cm, 1), "height_cm": round(height_cm, 1)}
        )
        x_cursor += px_w + 24

    svg_parts.append("</svg>")
    svg_content = "\n".join(svg_parts)

    patterns_dir = os.path.join(settings.upload_dir, "patterns")
    os.makedirs(patterns_dir, exist_ok=True)
    file_path = os.path.join(patterns_dir, f"{order_id}.svg")
    with open(file_path, "w", encoding="utf-8") as f:
        f.write(svg_content)

    return f"/uploads/patterns/{order_id}.svg", tech_sheet
