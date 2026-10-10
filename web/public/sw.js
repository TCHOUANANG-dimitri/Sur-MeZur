/**
 * Service worker minimal (B4).
 *
 * - Page hors connexion (« Vous etes hors ligne ») sur les navigations
 *   echouees ;
 * - mise en cache des ressources statiques seulement (fichiers `_next`,
 *   icones, page hors connexion) ;
 * - JAMAIS de `/api/*` : ni lecture ni ecriture du cache, pour ne jamais
 *   servir des donnees perimees ou authentifiees.
 */

/* eslint-disable no-restricted-globals */

const CACHE = "surmezur-static-v1";
const OFFLINE_URL = "/hors-connexion";
const PRECACHE = [OFFLINE_URL, "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
      .catch(() => {})
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
      .catch(() => {})
  );
});

function isApiRequest(url) {
  return url.pathname.startsWith("/api/");
}

function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname === "/manifest.webmanifest" ||
    url.pathname === "/icon.png" ||
    url.pathname === "/icon-192.png" ||
    url.pathname === "/icon-512.png" ||
    url.pathname === "/icon-maskable-512.png" ||
    url.pathname === "/logo.png" ||
    url.pathname === "/logo-mark.png"
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // API : jamais de cache, on laisse passer tel quel.
  if (isApiRequest(url)) return;

  // Navigations : reseau d'abord, page hors connexion en repli.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match(OFFLINE_URL).then((res) => res || Response.error()))
    );
    return;
  }

  // Statiques : cache d'abord, reseau en complement.
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
            return res;
          })
      )
    );
  }
});
