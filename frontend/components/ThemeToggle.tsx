"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

export function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.getAttribute("data-theme") === "dark");
  }, []);

  function toggle() {
    const next = dark ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("neo-theme", next);
    } catch {
      /* ignore */
    }
    setDark(!dark);
  }

  return (
    <button
      onClick={toggle}
      aria-label="Сменить тему"
      className="nb nb-press tap grid h-11 w-11 shrink-0 place-items-center text-[var(--ink)]"
      style={{ background: "var(--c3)" }}
    >
      {dark ? <Sun className="h-5 w-5" strokeWidth={2.75} /> : <Moon className="h-5 w-5" strokeWidth={2.75} />}
    </button>
  );
}
