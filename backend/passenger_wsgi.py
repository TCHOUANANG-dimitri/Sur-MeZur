"""Point d'entrée pour Passenger (cPanel/O2Switch).

Passenger sait parler WSGI, pas ASGI. `app.main:app` est une application
FastAPI (ASGI) ; `application` ci-dessous est ce que Passenger va réellement
charger, sous la forme WSGI attendue. Non utilisé en local ni sur Render, qui
lancent `app.main:app` directement via uvicorn (ASGI natif).
"""

from a2wsgi import ASGIMiddleware

from app.main import app as asgi_app

application = ASGIMiddleware(asgi_app)
