from fastapi import APIRouter

from app.api.v1 import (
    admin,
    auth,
    avatars,
    catalog,
    chat,
    deliveries,
    measurements,
    modifications,
    notifications,
    offers,
    orders,
    patterns,
    payments,
    quotes,
    reviews,
    tailors,
    tryon,
    users,
)

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(tailors.router)
api_router.include_router(measurements.router)
api_router.include_router(avatars.router)
api_router.include_router(catalog.router)
api_router.include_router(tryon.router)
api_router.include_router(orders.router)
api_router.include_router(offers.router)
api_router.include_router(quotes.router)
api_router.include_router(modifications.router)
api_router.include_router(chat.router)
api_router.include_router(patterns.router)
api_router.include_router(payments.router)
api_router.include_router(deliveries.router)
api_router.include_router(reviews.router)
api_router.include_router(notifications.router)
api_router.include_router(admin.router)
