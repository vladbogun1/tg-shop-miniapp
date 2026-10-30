"use client";

/**
 * «Лицо» приложения для общих компонентов. Mini App, сайт и админка рисуют одни и те же тосты и
 * примитивы чуть по-разному (отступы, слой, подложка) — вместо трёх копий компонент знает три лица и
 * берёт нужное из провайдера, который ставит приложение один раз. Сведение лиц в одно — отдельное
 * решение о дизайне, а не рефакторинга (визуальные дифы = баги).
 */
import { createContext, useContext, type ReactNode } from "react";

export type UiLook = "miniapp" | "site" | "admin";

const LookContext = createContext<UiLook>("site");

export function UiLookProvider({ look, children }: { look: UiLook; children: ReactNode }) {
  return <LookContext.Provider value={look}>{children}</LookContext.Provider>;
}

export function useUiLook(): UiLook {
  return useContext(LookContext);
}
