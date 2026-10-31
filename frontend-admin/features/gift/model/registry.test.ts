import { describe, expect, it } from "vitest";
import { buildCsv, cell, csvFileName, isValidSpan, monthSpan, uah } from "./registry";
import type { GiftRegistry } from "./types";

describe("monthSpan / isValidSpan", () => {
  it("границы месяца, в том числе високосного февраля", () => {
    expect(monthSpan(2026, 0)).toEqual(["2026-01-01", "2026-01-31"]);
    expect(monthSpan(2028, 1)).toEqual(["2028-02-01", "2028-02-29"]);
    expect(monthSpan(2026, 11)).toEqual(["2026-12-01", "2026-12-31"]);
  });

  it("период верный, если даты целые и «с» не позже «по»", () => {
    expect(isValidSpan("2026-10-01", "2026-10-31")).toBe(true);
    expect(isValidSpan("2026-10-31", "2026-10-01")).toBe(false);
    expect(isValidSpan("", "2026-10-01")).toBe(false);
  });
});

describe("CSV", () => {
  it("суммы — с запятой, поля с «;» и кавычками экранируются", () => {
    expect(uah(123456)).toBe("1234,56");
    expect(cell("a;b")).toBe('"a;b"');
    expect(cell('say "hi"')).toBe('"say ""hi"""');
    expect(cell(5)).toBe("5");
  });

  it("файл начинается с BOM, строки через CRLF, в хвосте — итоги", () => {
    const data = {
      from: "2026-10-01",
      to: "2026-10-31",
      count: 1,
      totalMinor: 50000,
      people: 1,
      overLimit: 1,
      limitMinor: 30000,
      rows: [
        {
          orderId: "12345678-0000",
          createdAt: "2026-10-05T10:00:00Z",
          deliveredAt: null,
          status: "NEW",
          customerName: "Іван",
          phone: "+380",
          tgUsername: "ivan",
          person: "Іван",
          title: "Мишка",
          variant: null,
          quantity: 1,
          unitMinor: 50000,
          valueMinor: 50000,
          source: "CASE",
          month: "2026-10",
          monthTotalMinor: 50000,
          overLimit: true,
          tier: "BRONZE",
        },
      ],
    } as unknown as GiftRegistry;
    const csv = buildCsv(data);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const lines = csv.slice(1).split("\r\n");
    expect(lines[0].split(";")).toHaveLength(18);
    expect(lines[1]).toContain("не вручено");
    expect(lines[1]).toContain("@ivan");
    expect(lines[1]).toContain("Кейс (рекламна акція)");
    // превышение: 500 − 300 = 200
    expect(lines[1].endsWith("500,00;300,00;200,00")).toBe(true);
    expect(lines).toContain("Осіб з перевищенням ліміту;1");
    expect(csvFileName(data)).toBe("podarunky_2026-10-01_2026-10-31.csv");
  });
});
