import { describe, expect, it } from "vitest";
import { SECTIONS, isActive, itemBadgeKeys, pageTitle, tabGroupFor, visibleTabs } from "./nav-config";

const item = (href: string) => SECTIONS.flatMap((s) => s.items).find((i) => i.href === href)!;

describe("меню: вкладки разделов", () => {
  it("пункт подсвечен на любой странице своей группы вкладок", () => {
    expect(isActive("/brands", "/products")).toBe(true);
    expect(isActive("/categories", "/products")).toBe(true);
    expect(isActive("/ai-tasks", "/cards")).toBe(true);
    expect(isActive("/cards/ai-review/7", "/cards")).toBe(true);
    expect(isActive("/gift/registry", "/promocodes")).toBe(true);
    expect(isActive("/writeoffs", "/metrics")).toBe(true);
    expect(isActive("/opening-cost", "/metrics")).toBe(true);
    expect(isActive("/incidents", "/audit")).toBe(true);
    expect(isActive("/settings/payment", "/settings")).toBe(true);
    expect(isActive("/brands", "/cards")).toBe(false);
  });
  it("строка вкладок — только на точных адресах вкладок, не на проверке ИИ", () => {
    expect(tabGroupFor("/brands")?.href).toBe("/products");
    expect(tabGroupFor("/gift/registry")?.href).toBe("/promocodes");
    expect(tabGroupFor("/cards/ai-review/7")).toBeUndefined();
    expect(tabGroupFor("/preorders")).toBeUndefined();
  });
  it("«Инциденты» видны только главному; бейдж «Карточек» = карточки + ИИ", () => {
    expect(visibleTabs(item("/audit"), false).map((t) => t.href)).toEqual(["/audit"]);
    expect(visibleTabs(item("/audit"), true).map((t) => t.href)).toEqual(["/audit", "/incidents"]);
    expect(itemBadgeKeys(item("/cards"), false)).toEqual(["cards", "ai"]);
  });
  it("заголовки страниц", () => {
    expect(pageTitle("/users")).toBe("Покупатели");
    expect(pageTitle("/settings/payment")).toBe("Оплата");
    expect(pageTitle("/settings/admins")).toBe("Админы");
    expect(pageTitle("/settings/delivery")).toBe("Настройки");
    expect(pageTitle("/orders/abc")).toBe("Заказ");
    expect(pageTitle("/nope")).toBe("Панель");
  });
});
