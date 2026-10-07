/* ChiSetup Admin — service worker.
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
  if (data.type === "APP_MODE" && data.standalone === true) event.waitUntil(rememberInstalled());
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
    data = { title: "ChiSetup Admin", body: event.data ? event.data.text() : "" };
  }
  // iOS revokes the subscription of a site that receives a push without showing a notification,
  // so a notification is shown for every push.
  event.waitUntil(Promise.all([showPush(data), setBadge(data.badge)]));
});

/** A run of chat messages stays one notification; it lists this many latest lines. */
const GROUP_LINES = 4;
/** An older notification is not continued: the chat has most likely been read since. */
const GROUP_MAX_AGE_MS = 6 * 60 * 60 * 1000;

function messagesWord(n) {
  const d = n % 10;
  const dd = n % 100;
  if (d === 1 && dd !== 11) return "сообщение";
  if (d >= 2 && d <= 4 && (dd < 12 || dd > 14)) return "сообщения";
  return "сообщений";
}

/** The notification with the same tag that is still on screen, if it was a chat group. */
async function shownGroup(tag) {
  if (!tag || !self.registration.getNotifications) return null;
  try {
    const shown = await self.registration.getNotifications({ tag });
    const prev = shown.find((n) => n.data && Array.isArray(n.data.lines));
    if (!prev || Date.now() - (prev.data.at || 0) > GROUP_MAX_AGE_MS) return null;
    return prev.data;
  } catch {
    return null;
  }
}

async function showPush(data) {
  let title = data.title || "ChiSetup Admin";
  let body = data.body || "";
  const url = typeof data.url === "string" && data.url.startsWith("/") ? data.url : "/inbox";
  const tag = data.tag || undefined;
  let image = typeof data.image === "string" && data.image.startsWith("/") ? data.image : undefined;
  const extra = { url };

  const group = data.group && typeof data.group.line === "string" ? data.group : null;
  if (group) {
    const prev = await shownGroup(tag);
    const count = (prev ? prev.count : 0) + 1;
    const lines = [...(prev ? prev.lines : []), group.line].slice(-GROUP_LINES);
    // The latest photo of the run stays as the picture.
    image = image || (prev && prev.image) || undefined;
    Object.assign(extra, { lines, count, image, at: Date.now() });
    if (count > 1) {
      title = `${group.title} · ${count} ${messagesWord(count)}`;
      body = lines.map((l) => "— " + l).join("\n");
    }
  }

  const options = {
    body,
    icon: "/icons/icon-192.png",
    badge: "/icons/badge-96.png",
    tag,
    renotify: !!tag,
    timestamp: Date.now(),
    data: extra,
  };
  // Shown large on Android and desktop Chrome; Safari ignores it. A link that has expired
  // (the phone was offline for hours) only costs the picture, the notification still shows.
  if (image) options.image = image;
  if (group) options.actions = [{ action: "open", title: "Открыть чат" }];
  return self.registration.showNotification(title, options);
}

// ---- which window is the installed app ---------------------------------------------------------
// A worker cannot see a window's display mode, so it asks: every page answers through a
// MessageChannel whether it runs as the installed app (standalone) or as a browser tab (lib/pwa.ts).
// «The app is installed» is remembered in the Cache Storage, so it survives the worker being stopped.

const MODE_CACHE = "chisetup-mode"; // not "admin-*": activate() drops those
const MODE_KEY = "/__installed";

function askMode(client) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 400);
    try {
      const ch = new MessageChannel();
      ch.port1.onmessage = (e) => {
        clearTimeout(timer);
        resolve(e.data && typeof e.data.standalone === "boolean" ? e.data.standalone : null);
      };
      client.postMessage({ type: "WHO_ARE_YOU" }, [ch.port2]);
    } catch {
      clearTimeout(timer);
      resolve(null);
    }
  });
}

async function rememberInstalled() {
  try {
    const cache = await caches.open(MODE_CACHE);
    await cache.put(MODE_KEY, new Response("1"));
  } catch {
    /* storage unavailable — fall back to the tab logic */
  }
}

async function appInstalled() {
  try {
    const cache = await caches.open(MODE_CACHE);
    return !!(await cache.match(MODE_KEY));
  } catch {
    return false;
  }
}

async function openIn(client, target) {
  // The open window navigates itself (keeps its state and the login); see components/pwa.
  client.postMessage({ type: "OPEN_URL", url: target });
  try {
    await client.focus();
  } catch {
    /* focus not allowed — the message still arrives */
  }
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/inbox";
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const own = all.filter((c) => new URL(c.url).origin === self.location.origin);
      const modes = await Promise.all(own.map(askMode));
      if (modes.some((m) => m === true)) await rememberInstalled();
      // 1) An open window of the installed app — always preferred over a browser tab.
      const app = own.filter((_, i) => modes[i] === true);
      if (app.length) return openIn(app.find((c) => c.focused) || app[0], target);
      // 2) The app is installed but not open: openWindow() of an in-scope URL launches it
      //    (Chrome on Android), instead of jumping into a stray browser tab.
      if (await appInstalled()) return self.clients.openWindow(target);
      // 3) No app: reuse an open tab, otherwise open one.
      const tab = own.find((c) => c.focused) || own[0];
      if (tab) return openIn(tab, target);
      await self.clients.openWindow(target);
    })()
  );
});
