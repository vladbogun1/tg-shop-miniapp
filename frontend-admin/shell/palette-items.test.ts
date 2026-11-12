import { describe, expect, it } from "vitest";
import { filterPalette, paletteItems } from "./palette-items";

/** 23 пункта меню до варианта B → где они теперь в палитре (оплата и админы — в настройках). */
const BEFORE_B: [string, string][] = [
  ["/inbox", "/inbox"],
  ["/", "/"],
  ["/dispatch", "/dispatch"],
  ["/support", "/support"],
  ["/products", "/products"],
  ["/preorders", "/preorders"],
  ["/cards", "/cards"],
  ["/ai-tasks", "/ai-tasks"],
  ["/categories", "/categories"],
  ["/brands", "/brands"],
  ["/translations", "/translations"],
  ["/reviews", "/reviews"],
  ["/users", "/users"],
  ["/broadcasts", "/broadcasts"],
  ["/promocodes", "/promocodes"],
  ["/gift", "/gift"],
  ["/metrics", "/metrics"],
  ["/writeoffs", "/writeoffs"],
  ["/audit", "/audit"],
  ["/payment", "/settings/payment"],
  ["/settings", "/settings"],
  ["/admins", "/settings/admins"],
  ["/incidents", "/incidents"],
];

describe("палитра разделов", () => {
  it("находит каждую страницу бывшего меню (главный админ)", () => {
    const hrefs = paletteItems(true).map((i) => i.href);
    for (const [, now] of BEFORE_B) expect(hrefs, now).toContain(now);
    expect(new Set(hrefs).size, "адреса не повторяются").toBe(hrefs.length);
  });
  it("скрывает «Админы», «Инциденты» и «Переводы» от обычного админа", () => {
    const hrefs = paletteItems(false).map((i) => i.href);
    expect(hrefs).not.toContain("/settings/admins");
    expect(hrefs).not.toContain("/incidents");
    expect(hrefs).not.toContain("/translations");
    expect(hrefs).toContain("/settings/payment");
    expect(hrefs).toContain("/audit");
  });
  it("ищет по названию, по разделу и по пункту меню вкладки", () => {
    const all = paletteItems(true);
    expect(filterPalette(all, "товар").map((i) => i.href)).toEqual(expect.arrayContaining(["/products", "/categories", "/brands"]));
    expect(filterPalette(all, "акции").map((i) => i.href)).toEqual(["/promocodes", "/gift"]);
    expect(filterPalette(all, "настройки").map((i) => i.href)).toEqual(["/settings", "/settings/payment", "/settings/admins"]);
    expect(filterPalette(all, "")).toHaveLength(all.length);
    expect(filterPalette(all, "zzzz")).toHaveLength(0);
  });
});
