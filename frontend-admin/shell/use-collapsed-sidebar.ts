"use client";

import { useEffect, useState } from "react";
import { localStore } from "@shop/core/storage";
import { useMediaQuery } from "@shop/ui/use-media";

const COLLAPSE_KEY = "admin-sidebar-collapsed";

type Choice = "collapsed" | "expanded" | null;

/** Выбор владельца из хранилища: "1" — свернуть, "0" — развернуть, нет записи — не выбирал. */
export function parseChoice(raw: string | null | undefined): Choice {
  if (raw === "1") return "collapsed";
  if (raw === "0") return "expanded";
  return null;
}

/** Что показывать: явный выбор главнее; без выбора — рейл ниже 1280 (полное меню съело бы треть экрана ноутбука). */
export function resolveCollapsed(choice: Choice, narrow: boolean): boolean {
  if (choice) return choice === "collapsed";
  return narrow;
}

/**
 * Состояние рельса на десктопе. Запоминается в браузере (удобство — без хранилища работает умолчание).
 * Кнопка разворота есть на любой ширине.
 */
export function useCollapsedSidebar(): { collapsed: boolean; canToggle: boolean; toggle: () => void } {
  const [choice, setChoice] = useState<Choice>(null);
  const narrow = useMediaQuery("(max-width: 1279px)", false);
  useEffect(() => {
    try {
      setChoice(parseChoice(localStore.getItem(COLLAPSE_KEY)));
    } catch {
      /* storage blocked — default by width */
    }
  }, []);
  const collapsed = resolveCollapsed(choice, narrow);
  function toggle() {
    const next: Choice = collapsed ? "expanded" : "collapsed";
    setChoice(next);
    try {
      localStore.setItem(COLLAPSE_KEY, next === "collapsed" ? "1" : "0");
    } catch {
      /* ignore */
    }
  }
  return { collapsed, canToggle: true, toggle };
}
