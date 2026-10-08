"""
Double authentification par code a usage unique (13.4), selon la RFC 6238 —
le format de Google Authenticator, Microsoft Authenticator, Authy, etc.

Bibliotheque standard seulement : HMAC-SHA1, pas de 30 s, 6 chiffres. Une
derive d'un pas avant ou apres est toleree, pour l'horloge d'un telephone.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
import struct
import time
from urllib.parse import quote


def new_secret() -> str:
    return base64.b32encode(secrets.token_bytes(20)).decode("ascii").rstrip("=")


def _code_at(secret: str, counter: int) -> str:
    padded = secret + "=" * (-len(secret) % 8)
    key = base64.b32decode(padded.upper())
    digest = hmac.new(key, struct.pack(">Q", counter), hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    value = struct.unpack(">I", digest[offset:offset + 4])[0] & 0x7FFFFFFF
    return f"{value % 1_000_000:06d}"


def current_code(secret: str, at: float | None = None) -> str:
    return _code_at(secret, int((at or time.time()) // 30))


def verify(secret: str | None, code: str | None, window: int = 1) -> bool:
    if not secret or not code:
        return False
    code = code.strip().replace(" ", "")
    if not code.isdigit() or len(code) != 6:
        return False
    counter = int(time.time() // 30)
    return any(
        hmac.compare_digest(_code_at(secret, counter + delta), code)
        for delta in range(-window, window + 1)
    )


def provisioning_uri(secret: str, account: str, issuer: str = "Sur-MeZur Admin") -> str:
    label = quote(f"{issuer}:{account}")
    return f"otpauth://totp/{label}?secret={secret}&issuer={quote(issuer)}&digits=6&period=30"
