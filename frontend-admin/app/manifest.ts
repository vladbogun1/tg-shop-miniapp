import type { MetadataRoute } from "next";

/**
 * Web app manifest (served as /manifest.webmanifest): what Chrome on Android installs and what
 * iOS reads for «На экран Домой». Colours = --bg of the one dark ChiSetup theme (app/globals.css).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "ChiSetup Admin",
    short_name: "ChiSetup",
    description: "Админка магазина ChiSetup: заказы, оплата, отправка, чаты с клиентами",
    lang: "ru",
    dir: "ltr",
    start_url: "/inbox",
    scope: "/",
    display: "standalone",
    display_override: ["standalone"],
    orientation: "any",
    background_color: "#0E0E10",
    theme_color: "#0E0E10",
    categories: ["business", "productivity", "shopping"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Внимание", short_name: "Внимание", url: "/inbox", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Заказы", short_name: "Заказы", url: "/", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Отправка", short_name: "Отправка", url: "/dispatch", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
