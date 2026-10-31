import { describe, expect, it } from "vitest";
import type { Product } from "@shop/core/types";
import { availableStock, canAddItem, effectiveStock, filterPickable } from "./item-picker";

const plain = (stock: number) => ({ id: "p", title: "Мышь", stock }) as Product;
const withVariants = () =>
  ({ id: "p", title: "Коврик", variants: [{ id: "s", name: "S", stock: 2 }, { id: "l", name: "L", stock: 3 }] }) as unknown as Product;

describe("остаток", () => {
  it("у товара с вариантами — сумма по вариантам", () => {
    expect(effectiveStock(plain(4))).toBe(4);
    expect(effectiveStock(withVariants())).toBe(5);
  });

  it("доступно: у варианта — его остаток, пока не выбран — 0", () => {
    const p = withVariants();
    expect(availableStock(p, null)).toBe(0);
    expect(availableStock(p, p.variants![1]!)).toBe(3);
    expect(availableStock(plain(7), null)).toBe(7);
  });
});

describe("canAddItem", () => {
  it("нужен вариант, количество от 1 до остатка", () => {
    const p = withVariants();
    expect(canAddItem(null, null, 1)).toBe(false);
    expect(canAddItem(p, null, 1)).toBe(false);
    expect(canAddItem(p, p.variants![0]!, 2)).toBe(true);
    expect(canAddItem(p, p.variants![0]!, 3)).toBe(false);
    expect(canAddItem(plain(2), null, 0)).toBe(false);
    expect(canAddItem(plain(2), null, 2)).toBe(true);
  });
});

describe("filterPickable", () => {
  it("без архивных, по названию, до 40", () => {
    const many = Array.from({ length: 50 }, (_, i) => ({ id: String(i), title: `Мышь ${i}` }) as Product);
    expect(filterPickable(many, "")).toHaveLength(40);
    expect(filterPickable([{ id: "a", title: "Мышь", archived: true } as Product], "мышь")).toEqual([]);
    expect(filterPickable(many, "мышь 7")).toHaveLength(1);
  });
});
