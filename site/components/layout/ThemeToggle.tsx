"use client";

/** Light/dark switch — same storage key and attribute as the Mini App (`neo-theme`). */
import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { useT } from "@/i18n/context";

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

export function ThemeToggle() {
  const t = useT();
  const [theme, set] = useTheme();
  const dark = theme === "dark";
  return (
    <button
      type="button"
      onClick={() => set(dark ? "light" : "dark")}
      aria-label={t("header.theme")}
      aria-pressed={dark}
      title={t("header.theme")}
      className="nb nb-hover tap grid h-11 w-11 shrink-0 place-items-center text-[var(--accent-ink)]"
      style={{ background: "var(--c3)" }}
    >
      {dark ? <Sun className="h-5 w-5" strokeWidth={2.75} /> : <Moon className="h-5 w-5" strokeWidth={2.75} />}
    </button>
  );
}
