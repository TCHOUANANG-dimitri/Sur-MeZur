"""Limitation de tentatives en memoire, par processus (A1.5).

Sans nouvelle dependance et sans Redis : un dictionnaire de fenetres
glissantes en memoire partagee de processus. Suffisant au volume de la
plateforme, et le cahier des charges demande explicitement « en memoire par
processus ».

Modele : « compteur par fenetre glissante ». Chaque cle (regle, cible) garde
les horodatages des appels de la fenetre ; tout appel au-dela de la limite
reçoit un 429. La fenetre se purge a l'usage (et un balayage periodique de
faible cout retire les regles inactives).

`client_ip()` lit `X-Forwarded-For` puis `X-Real-IP`, poses par Vercel et
nginx ; en local, la machine du client.
"""

from __future__ import annotations

import threading
import time

from fastapi import HTTPException, Request, status

# Fenetres (secondes) et limites imposées par le cahier des charges (A1.5).
WINDOW_MINUTE = 60
WINDOW_HOUR = 3600
WINDOW_15_MIN = 900

LIMITS = {
    # Connexion : 10 essais / 15 min par numero, et 10 / 15 min par IP.
    "login_phone": (10, WINDOW_15_MIN),
    "login_ip": (10, WINDOW_15_MIN),
    # Double authentification : 5 essais par jeton (jeton valable 5 min).
    "mfa_token": (5, 300),
    # Compte invite : 30 creations par heure par IP.
    "guest_ip": (30, WINDOW_HOUR),
    # Formulaire de contact anonyme : 5 par heure par IP.
    "ticket_ip": (5, WINDOW_HOUR),
    # Inscription : 10 par heure par IP.
    "register_ip": (10, WINDOW_HOUR),
}

TOO_MANY_FR = "Trop de tentatives. Attendez quelques minutes avant de réessayer."

_LOCK = threading.Lock()
# (regle, cible) -> liste des horodatages (monotonic) sur la fenetre courante.
_STORE: dict[tuple[str, str], list[float]] = {}


def client_ip(request: Request) -> str:
    """Adresse du client vue a travers les proxies (Vercel, nginx)."""
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    real = request.headers.get("x-real-ip")
    if real:
        return real.strip()
    return request.client.host if request.client else "unknown"


def check(rule: str, target: str, request: Request | None = None) -> None:
    """Compte un appel pour (regle, cible) et leve 429 si la fenetre est
    pleine. L'appel est comptabilise meme quand il est refuse : c'est le
    comportement attendu d'un compteur de tentatives."""
    limit, window = LIMITS[rule]
    now = time.monotonic()
    key = (rule, target)
    cutoff = now - window
    with _LOCK:
        times = _STORE.setdefault(key, [])
        # Purge au passage : on ne garde que la fenetre courante.
        if len(times) > limit * 2 and times[0] < cutoff:
            _STORE[key] = [t for t in times if t >= cutoff]
            times = _STORE[key]
        times.append(now)
        over = len([t for t in times if t >= cutoff]) > limit
    if over:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, detail=TOO_MANY_FR)


def _prune() -> None:
    """Vide les entrees inactives depuis plus d'une heure (appel de fond)."""
    border = time.monotonic() - WINDOW_HOUR - 60
    with _LOCK:
        dead = [k for k, v in _STORE.items() if not v or v[-1] < border]
        for k in dead:
            del _STORE[k]