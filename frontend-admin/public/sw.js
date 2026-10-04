/* MAXSOLCH Admin — service worker.
 *
 * Deliberately small (no Workbox):
 *  - /_next/static/* (content-hashed, immutable) and the icons: cache-first, so a relaunch of the
 *    installed app is instant;
 *  - page navigations: always the network; only when it fails — the cached «Нет связи» page;
 *  - NOTHING else is cached: no /api (orders, customers, chat), no /img, no /ws. Personal data
 *    never lands in a cache that outlives the session.
 *  - Web Push: shows the notification, sets the app-icon badge, opens the right screen on tap.
 *
 * Versioned by the ?v= of its registration URL (the build id): every deploy installs a new worker,
 * which waits until the user taps «Обновить приложение» (SKIP_WAITING) and then drops old caches.
 */
"use strict";

const VERSION = new URL(self.location.href).searchParams.get("v") || "dev";
const STATIC_CACHE = "admin-static-" + VERSION;
const SHELL_CACHE = "admin-shell-" + VERSION;
const OFFLINE_URL = "/offline.html";
const PRECACHE = [
  OFFLINE_URL,
  "/icons/icon.svg",
  "/icons/icon-192.png",
  "/icons/badge-96.png",
  "/icons/apple-touch-icon-180.png",
];
/** Upper bound for the runtime static cache (chunks of the current build are far fewer). */
const STATIC_MAX_ENTRIES = 300;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(PRECACHE.map((u) => new Request(u, { cache: "reload" }))))
  );
  // No skipWaiting() here: the page asks for it (button «Обновить приложение»), so a form being
  // filled in is never reloaded under the user's fingers.
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith("admin-") && k !== STATIC_CACHE && k !== SHELL_CACHE)
          .map((k) => caches.delete(k))
      );
      if (self.registration.navigationPreload) {
        try {
          await self.registration.navigationPreload.enable();
        } catch {
          /* not supported */
        }
      }
      await self.clients.claim();
    })()
  );
});

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "SKIP_WAITING") self.skipWaiting();
});

function isStatic(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/manifest.webmanifest" ||
    url.pathname === "/icon.svg"
  );
}

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length > max) {
    await Promise.all(keys.slice(0, keys.length - max).map((k) => cache.delete(k)));
  }
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // API on another origin (dev), fonts, Telegram
  // Never touch data: API, images, websocket, Next data/RSC requests.
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/img/") ||
    url.pathname.startsWith("/ws") ||
    url.searchParams.has("_rsc") ||
    req.headers.get("RSC") === "1"
  ) {
    return;
  }

  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const preloaded = await event.preloadResponse;
          if (preloaded) return preloaded;
          return await fetch(req);
        } catch {
          const offline = await caches.match(OFFLINE_URL);
          return offline || new Response("Нет связи", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
        }
      })()
    );
    return;
  }

  if (isStatic(url)) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(req);
        if (cached) return cached;
        const res = await fetch(req);
        if (res.ok && res.type === "basic") {
          const copy = res.clone();
          event.waitUntil(
            caches
              .open(STATIC_CACHE)
              .then((c) => c.put(req, copy))
              .then(() => trim(STATIC_CACHE, STATIC_MAX_ENTRIES))
          );
        }
        return res;
      })()
    );
  }
});

// ---- Web Push ---------------------------------------------------------------------------------

async function setBadge(count) {
  try {
    if (typeof count !== "number") return;
    if (count > 0 && self.navigator.setAppBadge) await self.navigator.setAppBadge(count);
    else if (count === 0 && self.navigator.clearAppBadge) await self.navigator.clearAppBadge();
  } catch {
    /* badges unsupported or not allowed */
  }
}

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "MAXSOLCH Admin", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "MAXSOLCH Admin";
  const url = typeof data.url === "string" && data.url.startsWith("/") ? data.url : "/inbox";
  const options = {
    body: data.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/badge-96.png",
    tag: data.tag || undefined,
    renotify: !!data.tag,
    timestamp: Date.now(),
    data: { url },
  };
  // iOS revokes the subscription of a site that receives a push without showing a notification,
  // so a notification is shown for every push.
  event.waitUntil(Promise.all([self.registration.showNotification(title, options), setBadge(data.badge)]));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/inbox";
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const own = all.filter((c) => new URL(c.url).origin === self.location.origin);
      const client = own.find((c) => c.focused) || own[0];
      if (client) {
        // The open app navigates itself (keeps its state and the login); see components/pwa.
        client.postMessage({ type: "OPEN_URL", url: target });
        try {
          await client.focus();
        } catch {
          /* focus not allowed — the message still arrives */
        }
        return;
      }
      await self.clients.openWindow(target);
    })()
  );
});
