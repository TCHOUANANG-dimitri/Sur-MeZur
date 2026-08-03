"""Chaîne de mesure par vision : MediaPipe (squelette) + SAM (silhouette)."""

from .pipeline import VisionResult, analyze_debug, capabilities, run

__all__ = ["VisionResult", "analyze_debug", "capabilities", "run"]
