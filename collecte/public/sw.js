/*
 * Service worker de Sur-MeZur Collecte : permet d'OUVRIR l'application sans
 * reseau, une fois qu'elle a ete visitee une premiere fois avec du reseau.
 *
 * Les fiches elles-memes ne passent jamais par ici : elles sont dans
 * IndexedDB (src/lib/outbox.ts) et partent par l'API. Ce fichier ne met en
 * cache que l'application (pages, scripts, styles, images).
 *
 * - /api/* : JAMAIS en cache (donnees personnelles, et une reponse perimee
 *   ferait croire qu'une fiche est envoyee).
 * - /_next/static/* : cache d'abord (noms de fichiers versionnes, immuables).
 * - le reste (pages, charges utiles RSC de la navigation) : reseau d'abord,
 *   cache en repli hors ligne.
 */

const CACHE = "smz-collecte-v1";
const SHELL = ["/tableau-de-bord", "/sujets", "/sujets/nouveau", "/protocole", "/connexion", "/logo.png", "/logo-mark.png", "/icon.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => Promise.allSettled(SHELL.map((url) => cache.add(url))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy));
            }
            return res;
          })
      )
    );
    return;
  }

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && res.type === "basic") {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(async () => {
        const hit = await caches.match(req);
        if (hit) return hit;
        // Page jamais visitee : on sert l'accueil plutot qu'une erreur du
        // navigateur ; la file d'envoi et la saisie y restent accessibles.
        if (req.mode === "navigate") {
          const home = await caches.match("/tableau-de-bord");
          if (home) return home;
        }
        return Response.error();
      })
  );
});
