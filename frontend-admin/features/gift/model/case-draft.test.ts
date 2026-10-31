import { describe, expect, it } from "vitest";
import {
  addRow,
  canDrop,
  changes,
  chanceOf,
  defaultDiscountUah,
  fromServer,
  lanesOf,
  liveTotal,
  normalize,
  parsePct,
  removeRow,
  setChance,
  setLaneShare,
  sortRows,
  summarize,
  toDraft,
  TOTAL_WEIGHT,
  WEIGHT_PER_PERCENT,
  type Row,
} from "./case-draft";
import type { CaseItemAdmin, GiftTierAdmin } from "./types";

let n = 0;
function row(over: Partial<Row> = {}): Row {
  n++;
  return {
    key: `k${n}`,
    id: n,
    kind: "PRODUCT",
    productId: `p${n}`,
    discountPercent: 0,
    discountUah: 0,
    rarity: "COMMON",
    weight: 0,
    active: true,
    title: `Приз ${n}`,
    imageUrl: null,
    priceMinor: 100_00,
    stock: 5,
    productActive: true,
    category: null,
    ...over,
  };
}

const sum = (rows: Row[]) => rows.reduce((s, r) => s + (canDrop(r) ? r.weight : 0), 0);

describe("canDrop", () => {
  it("товар выпадает только в наличии, видимый, включённый и с весом", () => {
    expect(canDrop(row({ weight: 10 }))).toBe(true);
    expect(canDrop(row({ weight: 0 }))).toBe(false);
    expect(canDrop(row({ weight: 10, active: false }))).toBe(false);
    expect(canDrop(row({ weight: 10, stock: 0 }))).toBe(false);
    expect(canDrop(row({ weight: 10, productActive: false }))).toBe(false);
  });

  it("скидка выпадает, если у неё есть значение", () => {
    expect(canDrop(row({ kind: "DISCOUNT", productId: null, stock: 0, discountUah: 50, weight: 10 }))).toBe(true);
    expect(canDrop(row({ kind: "DISCOUNT", productId: null, stock: 0, discountPercent: 5, weight: 10 }))).toBe(true);
    expect(canDrop(row({ kind: "DISCOUNT", productId: null, stock: 0, weight: 10 }))).toBe(false);
  });
});

describe("normalize", () => {
  it("приводит сумму живых весов к 100 %", () => {
    const rows = normalize([row({ weight: 30 }), row({ weight: 10 }), row({ weight: 60 })]);
    expect(sum(rows)).toBe(TOTAL_WEIGHT);
  });

  it("сохраняет пропорции и не трогает призы, которые не могут выпасть", () => {
    const dead = row({ weight: 500, stock: 0 });
    const rows = normalize([row({ weight: 1 }), row({ weight: 3 }), dead]);
    expect(rows[1].weight).toBe(rows[0].weight * 3);
    expect(rows[2].weight).toBe(500);
  });

  it("делит поровну, если у всех живых вес 0 после выключения остальных", () => {
    const rows = normalize([row({ weight: 0 }), row({ weight: 0 })].map((r) => ({ ...r, weight: 1 })));
    expect(sum(rows)).toBe(TOTAL_WEIGHT);
  });

  it("остаток округления уходит самому большому", () => {
    const rows = normalize([row({ weight: 1 }), row({ weight: 1 }), row({ weight: 1 })]);
    expect(sum(rows)).toBe(TOTAL_WEIGHT);
  });
});

describe("setChance", () => {
  it("ставит шанс приза, остальные делят остаток", () => {
    const [a, b, c] = normalize([row({ weight: 1 }), row({ weight: 1 }), row({ weight: 2 })]);
    const rows = setChance([a, b, c], a.key, 40);
    expect(rows[0].weight).toBe(40 * WEIGHT_PER_PERCENT);
    expect(sum(rows)).toBe(TOTAL_WEIGHT);
    // b и c сохранили пропорцию 1:2
    expect(rows[2].weight).toBeGreaterThan(rows[1].weight);
  });

  it("зажимает шанс в 0…100", () => {
    const rows = normalize([row({ weight: 1 }), row({ weight: 1 })]);
    expect(setChance(rows, rows[0].key, 150)[0].weight).toBe(TOTAL_WEIGHT);
    expect(setChance(rows, rows[0].key, -5)[0].weight).toBe(0);
  });
});

describe("setLaneShare", () => {
  it("доля редкости меняется, призы внутри сохраняют пропорции", () => {
    const rows = normalize([
      row({ rarity: "COMMON", weight: 3 }),
      row({ rarity: "COMMON", weight: 1 }),
      row({ rarity: "RARE", weight: 4 }),
    ]);
    const next = setLaneShare(rows, "COMMON", 20);
    const common = next.filter((r) => r.rarity === "COMMON");
    expect(common.reduce((s, r) => s + r.weight, 0)).toBe(20 * WEIGHT_PER_PERCENT);
    expect(common[0].weight).toBe(common[1].weight * 3);
    expect(sum(next)).toBe(TOTAL_WEIGHT);
  });

  it("пустая редкость — без изменений", () => {
    const rows = normalize([row({ rarity: "COMMON", weight: 1 })]);
    expect(setLaneShare(rows, "EPIC", 10)).toBe(rows);
  });
});

describe("addRow / removeRow", () => {
  it("новый приз получает шанс по умолчанию своей редкости, остальные уступают", () => {
    const rows = normalize([row({ weight: 1 }), row({ weight: 1 })]);
    const added = row({ rarity: "RARE" });
    const next = addRow(rows, added);
    expect(next.find((r) => r.key === added.key)!.weight).toBe(6 * WEIGHT_PER_PERCENT);
    expect(sum(next)).toBe(TOTAL_WEIGHT);
  });

  it("приз без наличия добавляется без пересчёта остальных", () => {
    const rows = normalize([row({ weight: 1 })]);
    const next = addRow(rows, row({ stock: 0 }));
    expect(next[0].weight).toBe(rows[0].weight);
  });

  it("удаление возвращает сумму к 100 %", () => {
    const rows = normalize([row({ weight: 1 }), row({ weight: 1 }), row({ weight: 2 })]);
    const next = removeRow(rows, rows[2].key);
    expect(next).toHaveLength(2);
    expect(sum(next)).toBe(TOTAL_WEIGHT);
  });
});

describe("chanceOf / liveTotal", () => {
  it("шанс — доля веса среди тех, что могут выпасть", () => {
    const rows = [row({ weight: 25 }), row({ weight: 75 }), row({ weight: 100, stock: 0 })];
    const total = liveTotal(rows);
    expect(total).toBe(100);
    expect(chanceOf(rows[0], total)).toBe(25);
    expect(chanceOf(rows[2], total)).toBe(0);
  });
});

describe("changes", () => {
  const pub = (over: Partial<CaseItemAdmin> = {}): CaseItemAdmin => ({
    id: 1,
    tier: "BRONZE",
    kind: "PRODUCT",
    productId: "p1",
    title: "Приз",
    imageUrl: null,
    priceMinor: 100_00,
    stock: 5,
    productActive: true,
    discountPercent: 0,
    discountUah: 0,
    rarity: "COMMON",
    weight: 100,
    chancePercent: 100,
    sortOrder: 10,
    active: true,
    ...over,
  });

  it("черновик, равный опубликованному, — 0 изменений", () => {
    const published = [pub({ id: 1 }), pub({ id: 2, productId: "p2", sortOrder: 20 })];
    expect(changes(published.map(fromServer), published)).toBe(0);
  });

  it("считает изменённые, добавленные, удалённые и сдвинутые призы", () => {
    const published = [pub({ id: 1 }), pub({ id: 2, productId: "p2", sortOrder: 20 })];
    const rows = published.map(fromServer);
    expect(changes([{ ...rows[0], weight: 5 }, rows[1]], published)).toBe(1);
    expect(changes([rows[0]], published)).toBe(1);
    expect(changes([...rows, row({ id: null })], published)).toBe(1);
    expect(changes([rows[1], rows[0]], published)).toBe(2);
  });
});

describe("summarize", () => {
  const tier = {
    thresholdUah: 1000,
    marginPercent: 20,
    monthlyOrders: 100,
    guaranteedPercent: 0,
    guaranteedMaxUah: 0,
  } as unknown as GiftTierAdmin;

  it("себестоимость товара — цена минус маржа, доля маржи — от маржи на пороге", () => {
    const rows = normalize([row({ weight: 1, priceMinor: 500_00 })]);
    const s = summarize(rows, tier);
    // маржа на пороге 1000 ₴ × 20 % = 200 ₴; приз 500 ₴ стоит магазину 400 ₴
    expect(s.marginMinor).toBe(200_00);
    expect(s.avgCostMinor).toBe(400_00);
    expect(s.costShare).toBe(200);
    expect(s.live).toBe(1);
    expect(s.perMonth.get(rows[0].key)).toBe(100);
  });

  it("скидка стоит свою сумму; приз, которого не хватит на месяц, попадает в shortStock", () => {
    const disc = row({ kind: "DISCOUNT", productId: null, stock: 0, discountUah: 100, weight: 1 });
    const scarce = row({ weight: 1, stock: 3 });
    const s = summarize(normalize([disc, scarce]), tier);
    expect(s.shortStock.map((r) => r.key)).toEqual([scarce.key]);
    expect(s.share.COMMON).toBeCloseTo(100);
  });

  it("гарантированная скидка с потолком", () => {
    const t = { ...tier, guaranteedPercent: 10, guaranteedMaxUah: 50 } as GiftTierAdmin;
    expect(summarize([], t).guaranteedMinor).toBe(50_00);
  });
});

describe("прочее", () => {
  it("toDraft отдаёт только то, что принимает сервер", () => {
    const r = row({ weight: 7 });
    expect(Object.keys(toDraft([r])[0]).sort()).toEqual(
      ["active", "discountPercent", "discountUah", "id", "kind", "productId", "rarity", "weight"].sort()
    );
  });

  it("parsePct принимает запятую и точку, до 4 знаков, 0…100", () => {
    expect(parsePct("12,5")).toBe(12.5);
    expect(parsePct("0.0001")).toBe(0.0001);
    expect(parsePct("100")).toBe(100);
    expect(parsePct("100.5")).toBeNull();
    expect(parsePct("1.23456")).toBeNull();
    expect(parsePct("abc")).toBeNull();
    expect(parsePct("")).toBeNull();
  });

  it("скидка по умолчанию — доля порога, шаг 50 ₴, не меньше 50", () => {
    expect(defaultDiscountUah("COMMON", 1000)).toBe(50);
    expect(defaultDiscountUah("RARE", 1000)).toBe(150);
    expect(defaultDiscountUah("GOLD", 1000)).toBe(1000);
    expect(defaultDiscountUah("COMMON", 100)).toBe(50);
  });

  it("сортировка по редкости сохраняет порядок внутри неё", () => {
    const a = row({ rarity: "RARE" });
    const b = row({ rarity: "COMMON" });
    const c = row({ rarity: "RARE" });
    expect(sortRows([a, b, c]).map((r) => r.key)).toEqual([b.key, a.key, c.key]);
  });

  it("джекпот-линия только в золотом кейсе или если там уже есть приз", () => {
    expect(lanesOf("BRONZE", [])).not.toContain("GOLD");
    expect(lanesOf("GOLD", [])).toContain("GOLD");
    expect(lanesOf("SILVER", [row({ rarity: "GOLD" })])).toContain("GOLD");
  });
});
