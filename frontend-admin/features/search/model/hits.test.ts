import { describe, expect, it } from "vitest";
import { hitGroups, normalizeQuery, type SearchResults } from "./hits";

const results: SearchResults = {
  orders: [{ id: "5bf865c4-0000-0000-0000-000000000001", shortId: "5bf865c4", customerName: "Анна", phone: "+380501112233", totalMinor: 150000, status: "SHIPPED", createdAt: "2026-11-01T10:00:00Z" }],
  products: [{ id: "p1", title: "Мышь Lamzu", sku: "LZ-1", priceMinor: 250000, currency: "UAH", stock: 3, active: false }],
  customers: [
    { telegramUserId: 42, name: "Борис К", username: "boris", phone: "+380501112233" },
    { telegramUserId: 43, name: null, username: null, phone: null },
  ],
} as SearchResults;

describe("hitGroups", () => {
  it("строит группы в порядке заказы, товары, покупатели", () => {
    expect(hitGroups(results).map((g) => g.title)).toEqual(["Заказы", "Товары", "Покупатели"]);
  });
  it("заказ ведёт на свою страницу, товар — в окно товара, покупатель — в список по ID", () => {
    const [orders, products, customers] = hitGroups(results);
    expect(orders.rows[0]).toMatchObject({ title: "#5bf865c4 · Анна", href: "/orders/5bf865c4-0000-0000-0000-000000000001" });
    expect(orders.rows[0].hint).toContain("Отправлен");
    expect(products.rows[0].href).toBe("/products?edit=p1");
    expect(products.rows[0].hint).toContain("скрыт");
    expect(customers.rows[0]).toMatchObject({ title: "Борис К", href: "/users?q=42" });
    expect(customers.rows[0].hint).toContain("@boris");
    expect(customers.rows[1].title).toBe("ID 43");
  });
  it("пустые группы и отсутствие ответа не рисуются", () => {
    expect(hitGroups(undefined)).toEqual([]);
    expect(hitGroups({ orders: [], products: [], customers: [] }).length).toBe(0);
  });
  it("запрос обрезается по краям", () => {
    expect(normalizeQuery("  мышь ")).toBe("мышь");
  });
});
