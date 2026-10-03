"use client";

/**
 * Light/dark theme state — same storage key and attribute as the Mini App (`neo-theme`). The header
 * button is gone (owner's call); the theme is switched in /account/settings, and the stored choice
 * is still applied before first paint by THEME_SCRIPT in app/[locale]/layout.tsx.
 */
import { useEffect, useState } from "react";

export function applyTheme(next: "light" | "dark"): void {
  document.documentElement.setAttribute("data-theme", next);
  try {
    localStorage.setItem("neo-theme", next);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent("neo-theme", { detail: next }));
}

export function useTheme(): ["light" | "dark", (t: "light" | "dark") => void] {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  useEffect(() => {
    setTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light");
    const h = (e: Event) => setTheme((e as CustomEvent<"light" | "dark">).detail);
    window.addEventListener("neo-theme", h);
    return () => window.removeEventListener("neo-theme", h);
  }, []);
  return [theme, applyTheme];
}
