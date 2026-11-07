import { describe, expect, it } from "vitest";
import type { AiWidgetData } from "../api";
import { widgetHidden, widgetLine } from "./widget";

const w = (over: Partial<AiWidgetData> = {}): AiWidgetData => ({
  canRun: true,
  configured: true,
  enabled: true,
  running: 0,
  review: 0,
  problems: 0,
  ...over,
});

describe("виджет ИИ на дашборде", () => {
  it("финансисту — расход, админу — можно ли запускать", () => {
    expect(widgetLine(w({ monthSpentMinor: 1900, monthLimitMinor: 42000, review: 14 }))).toContain("ждёт проверки 14");
    expect(widgetLine(w({ monthSpentMinor: 1900, monthLimitMinor: 42000 }))).toContain("Расход");
    expect(widgetLine(w({ review: 3 }))).toBe("ИИ можно запускать · ждёт проверки 3");
    expect(widgetLine(w({ canRun: false }))).toBe("ИИ сейчас остановлен");
    expect(widgetLine(w({ canRun: false, enabled: false }))).toBe("ИИ выключен");
  });

  it("у админа в строке нет ни одной суммы", () => {
    expect(widgetLine(w({ review: 1 }))).not.toMatch(/₴/);
  });

  it("не настроенный ИИ без дел не занимает место", () => {
    expect(widgetHidden(w({ configured: false }))).toBe(true);
    expect(widgetHidden(w({ configured: false, review: 1 }))).toBe(false);
    expect(widgetHidden(w())).toBe(false);
    expect(widgetHidden(undefined)).toBe(true);
  });
});
