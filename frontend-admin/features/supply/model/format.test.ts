import { describe, expect, it } from "vitest";
import { fileSize } from "./money-form";
import { arrivedUnitCost, batchName, decimal1, marginPercent, supplierInSubtitle } from "./format";

describe("batchName", () => {
  it("номер впереди, дата заведения по Киеву в конце", () => {
    expect(batchName({ id: 10, title: "Taobao · X-Raypad — коврики и глайды", createdAt: "2026-11-04T22:30:00Z" })).toBe(
      "№10 · Taobao · X-Raypad — коврики и глайды · 05.11.2026",
    );
  });
  it("дата уже в названии — не повторяем", () => {
    expect(batchName({ id: 4, title: "Поставка от 06.11", createdAt: "2026-11-06T10:00:00Z" })).toBe("№4 · Поставка от 06.11");
  });
});

// Сверка со старыми формулами: .toFixed(1).replace(".", ",") и ((p - c) / p) * 100.
describe("decimal1", () => {
  it("совпадает с toFixed(1) + запятая на типичных значениях", () => {
    for (const n of [0, 0.5, 0.04, 12.345, 1e-7, 33.333333, 99.95, 100, -12.34, -0.04, 1.25, 1234.56, -50]) {
      expect(decimal1(n)).toBe(n.toFixed(1).replace(".", ","));
    }
  });
});

describe("fileSize", () => {
  it("байты, КБ, МБ", () => {
    expect(fileSize(500)).toBe("500 Б");
    expect(fileSize(2048)).toBe("2 КБ");
    expect(fileSize(1536 * 1024)).toBe("1,5 МБ");
    expect(fileSize(1310720)).toBe("1,3 МБ");
    expect(fileSize(10 * 1024 * 1024)).toBe("10,0 МБ");
  });
});

describe("marginPercent", () => {
  it("совпадает с ((p - c) / p) * 100 бит-в-бит", () => {
    for (const [p, c] of [[10000, 6000], [9999, 3333], [100, 0], [100, 150], [12345, 6789], [1, 1]] as const) {
      expect(marginPercent(p, c)).toBe(((p - c) / p) * 100);
    }
  });
});

describe("себестоимость при частичном приходе", () => {
  it("расходы строки делятся на пришедшие штуки", () => {
    // закупка 200 ₴/шт, расходы на строку 1 000 ₴: пришло 10 → 300 ₴, пришло 5 → 400 ₴
    expect(arrivedUnitCost(20_000, 100_000, 10)).toBe(30_000);
    expect(arrivedUnitCost(20_000, 100_000, 5)).toBe(40_000);
    expect(arrivedUnitCost(20_000, 100_000, 0)).toBeNull();
    expect(arrivedUnitCost(null, 100_000, 5)).toBeNull();
  });
});

describe("supplierInSubtitle", () => {
  it("поставщик уже в названии — в подзаголовке не повторяем (регистр и пробелы не важны)", () => {
    expect(supplierInSubtitle("ZHENGZHOU  XINGHE TRADE · INV-12", "Zhengzhou Xinghe Trade")).toBeNull();
  });
  it("в названии нет — показываем; нет поставщика — «без поставщика»", () => {
    expect(supplierInSubtitle("Мыши к Новому году", "Zhengzhou Xinghe")).toBe("Zhengzhou Xinghe");
    expect(supplierInSubtitle("Мыши", null)).toBe("без поставщика");
  });
});
