"use client";

import { useEffect, useState } from "react";

export type Theme = "dark" | "light";
const KEY = "admin-theme";

export function getStoredTheme(): Theme {
  if (typeof window === "undefined") return "light";
  const v = window.localStorage.getItem(KEY);
  return v === "dark" ? "dark" : "light";
}

function apply(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
}

export function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const t = getStoredTheme();
    setTheme(t);
    apply(t);
  }, []);

  function update(t: Theme) {
    setTheme(t);
    apply(t);
    window.localStorage.setItem(KEY, t);
  }

  return [theme, update];
}
