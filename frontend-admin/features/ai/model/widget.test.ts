import { describe, expect, it } from "vitest";
import type { AiWidgetData } from "../api";
import { widgetChip, widgetHidden, widgetLine, widgetShort } from "./widget";

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

  it("на телефоне — короткая строка, которая влезает в 320 px", () => {
    const owner = widgetShort(w({ monthSpentMinor: 0, monthLimitMinor: 42000, review: 1, problems: 1 }));
    expect(owner).toMatch(/^0 ₴ из 420 ₴ · ждёт 1 · проблем 1$/);
    expect(owner.length).toBeLessThanOrEqual(34);
    expect(widgetShort(w({ review: 12, problems: 3 }))).toBe("ждёт 12 · проблем 3");
    expect(widgetShort(w())).toBe("ИИ");
    expect(widgetShort(w({ canRun: false, enabled: false }))).toBe("выключен");
  });

  it("чип как остальные «Сегодня»: подпись + значение", () => {
    const owner = widgetChip(w({ monthSpentMinor: 2037, monthLimitMinor: 460000 }));
    expect(owner.label).toBe("Расход ИИ");
    expect(owner.value.replace(/\s/g, " ")).toBe("20,37 ₴ из 4 600 ₴");
    expect(widgetChip(w({ review: 3 }))).toEqual({ label: "ИИ", value: "ждёт 3" });
    expect(widgetChip(w())).toEqual({ label: "ИИ", value: "можно запускать" });
    expect(widgetChip(w({ canRun: false, enabled: false }))).toEqual({ label: "ИИ", value: "выключен" });
  });

  it("не настроенный ИИ без дел не занимает место", () => {
    expect(widgetHidden(w({ configured: false }))).toBe(true);
    expect(widgetHidden(w({ configured: false, review: 1 }))).toBe(false);
    expect(widgetHidden(w())).toBe(false);
    expect(widgetHidden(undefined)).toBe(true);
  });
});
