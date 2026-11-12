import { describe, expect, it } from "vitest";
import type { SettingItem } from "../api";
import { npPanelHits, settingHits } from "./global-search";
import { legacyAnchorTarget, npTabOf, sectionOfGroup, settingHref, visibleSections } from "./sections";

const ALL_GROUPS = ["orders", "payment", "stock", "notifications", "reviews", "support", "bot", "novaposhta", "inbox", "antibot", "gift", "preorder", "costing", "ai"];
const ids = (groups: string[], superAdmin?: boolean) => visibleSections(groups, superAdmin).map((s) => s.id);

const item = (key: string, group: string, label: string, subgroup: string | null = null) =>
  ({ key, group, label, description: "", subgroup, type: "BOOL", value: true, defaultValue: true, overridden: false }) as unknown as SettingItem;

describe("разделы настроек", () => {
  it("порядок как в макете; «Админы» только главному", () => {
    expect(ids(ALL_GROUPS, true)).toEqual(["payment", "delivery", "orders", "stock", "bot", "reviews", "support", "ai", "gift", "site", "admins", "system"]);
    expect(ids(ALL_GROUPS, false)).not.toContain("admins");
    expect(ids(ALL_GROUPS, undefined)).not.toContain("admins");
  });

  it("раздел без групп скрыт: без финансов нет «ИИ»; группы раздела — только пришедшие", () => {
    const sections = visibleSections(ALL_GROUPS.filter((g) => g !== "ai"), false);
    expect(sections.map((s) => s.id)).not.toContain("ai");
    expect(sections.find((s) => s.id === "orders")?.groups).toEqual(["inbox", "antibot", "preorder", "orders"]);
    expect(visibleSections(["stock"], false).find((s) => s.id === "stock")?.groups).toEqual(["stock"]);
  });

  it("новая группа с бэкенда не пропадает: «Прочее» в конце блока «Магазин»", () => {
    const sections = visibleSections([...ALL_GROUPS, "loyalty"], false);
    const other = sections.find((s) => s.id === "other");
    expect(other?.groups).toEqual(["loyalty"]);
    expect(sections.map((s) => s.id).indexOf("other")).toBe(sections.map((s) => s.id).indexOf("site") + 1);
    expect(ids(ALL_GROUPS)).not.toContain("other");
    expect(sectionOfGroup("loyalty")).toBe("other");
  });

  it("ссылка на поле: раздел, вкладка, якорь; подарок — на /gift", () => {
    expect(settingHref(item("novaposhta.tracking", "novaposhta", "Отслеживать", "tracking"))).toBe("/settings/delivery?tab=tracking#setting-novaposhta.tracking");
    expect(settingHref(item("p.x", "payment", "X"))).toBe("/settings/payment?tab=params#setting-p.x");
    expect(settingHref(item("catalog.lowStockQty", "stock", "Порог"))).toBe("/settings/stock#setting-catalog.lowStockQty");
    expect(settingHref(item("gift.on", "gift", "Подарок"))).toBe("/gift");
    expect(npTabOf(null)).toBe("other");
    expect(npTabOf("boxes")).toBe("boxes");
  });

  it("старые якоря /settings ведут в раздел", () => {
    expect(legacyAnchorTarget("#group-novaposhta")).toBe("/settings/delivery");
    expect(legacyAnchorTarget("#group-ai")).toBe("/settings/ai");
    expect(legacyAnchorTarget("#group-costing")).toBe("/settings/stock");
    expect(legacyAnchorTarget("#site")).toBe("/settings/site");
    expect(legacyAnchorTarget("#group-payment")).toBe("/settings/payment?tab=params");
    expect(legacyAnchorTarget("#group-unknown")).toBe("/settings/other");
    expect(legacyAnchorTarget("#setting-x")).toBeNull();
  });
});

describe("поиск по всем настройкам", () => {
  const items = [item("catalog.lowStockQty", "stock", "Порог «мало на складе»"), item("novaposhta.tracking", "novaposhta", "Отслеживать посылки", "tracking")];

  it("находит поле в другом разделе со ссылкой на него", () => {
    expect(settingHits(items, "посылк")).toEqual([
      { key: "novaposhta.tracking", label: "Отслеживать посылки", section: "Доставка", href: "/settings/delivery?tab=tracking#setting-novaposhta.tracking" },
    ]);
    expect(settingHits(items, "lowStock")).toHaveLength(1);
    expect(settingHits(items, "lowStock", "label")).toHaveLength(0);
    expect(settingHits(items, "  ")).toEqual([]);
  });

  it("панели НП — на своих вкладках, «пошта» находит их по названию группы", () => {
    const panels = [{ id: "webhook", title: "Миттєві статуси (вебхуки)", keywords: "мгновенные" }];
    expect(npPanelHits(panels, "вебхук")[0].href).toBe("/settings/delivery?tab=tracking#np-webhook");
    expect(npPanelHits(panels, "пошта", "Новая Почта")).toHaveLength(1);
    expect(npPanelHits(panels, "пошта")).toHaveLength(0);
  });
});
