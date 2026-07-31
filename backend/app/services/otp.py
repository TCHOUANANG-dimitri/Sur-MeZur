"""Dev-mode OTP store. No SMS gateway is configured, so the code is handed back
directly in the /auth/otp/request response instead of being sent by SMS."""

import random
import time

_STORE: dict[str, tuple[str, float]] = {}
_TTL_SECONDS = 300


def generate_otp(phone: str) -> str:
    code = f"{random.randint(0, 999999):06d}"
    _STORE[phone] = (code, time.time() + _TTL_SECONDS)
    return code


def verify_otp(phone: str, code: str) -> bool:
    entry = _STORE.get(phone)
    if not entry:
        return False
    stored_code, expires_at = entry
    if time.time() > expires_at:
        del _STORE[phone]
        return False
    if stored_code != code:
        return False
    del _STORE[phone]
    return True
