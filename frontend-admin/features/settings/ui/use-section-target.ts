"use client";

/**
 * Вкладка и поле страницы раздела из адреса: `?tab=` (вкладка «Доставки»/«Оплаты») и `#setting-<key>` / `#np-<панель>`.
 * Без `?tab=` вкладка берётся по самому полю, на которое ведёт якорь (внешняя ссылка без вкладки тоже откроет нужную).
 * «Показать» в панели сохранения ведёт к первому изменённому полю тем же путём.
 */
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { SettingItem } from "../api";
import { NP_PANEL_TAB, tabOfSetting } from "../model/sections";
import { settingKeyOf, useHashTarget, useScrollToTarget } from "./use-setting-focus";

export function useSectionTarget(items: readonly SettingItem[], loaded: boolean) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const hashTarget = useHashTarget(params.toString());
  const [manual, setManual] = useState<{ target: string; nonce: number } | null>(null);
  // Новая ссылка с якорем главнее «Показать»; смена вкладки (якорь пропал) ручную цель не сбрасывает.
  useEffect(() => {
    if (hashTarget) setManual(null);
  }, [hashTarget]);

  const target = manual?.target ?? hashTarget;
  const focusKey = settingKeyOf(target);
  const targetItem = focusKey ? items.find((it) => it.key === focusKey) : undefined;
  const derivedTab = targetItem ? tabOfSetting(targetItem) : target?.startsWith("np-") ? (NP_PANEL_TAB[target.slice(3)] ?? null) : null;
  const tab = params.get("tab") ?? derivedTab;

  useScrollToTarget(target, loaded, manual?.nonce ?? 0);

  const setTab = (next: string) => router.replace(`${pathname}?tab=${encodeURIComponent(next)}`, { scroll: false });
  /** Прокрутить к полю этой страницы, переключив вкладку, если надо. */
  const show = (item: SettingItem) => {
    const itemTab = tabOfSetting(item);
    if (itemTab && itemTab !== tab) setTab(itemTab);
    setManual((m) => ({ target: "setting-" + item.key, nonce: (m?.nonce ?? 0) + 1 }));
  };
  return { tab, setTab, focusKey, show };
}
