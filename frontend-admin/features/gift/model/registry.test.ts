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

describe("uah", () => {
  // Старая формула: toFixed + замена точки; для целых копеек обязана совпадать с Intl-вариантом.
  const old = (minor: number) => (minor / 100).toFixed(2).replace(".", ",");

  it("копейки → «1234,56»: без группировки, запятая, всегда два знака", () => {
    expect(uah(123456)).toBe("1234,56");
    expect(uah(0)).toBe("0,00");
    expect(uah(5)).toBe("0,05");
    expect(uah(100000000)).toBe("1000000,00");
    expect(uah(-150)).toBe("-1,50");
  });

  it("совпадает со старой формулой на целых копейках", () => {
    const grid = [0, 1, 5, 9, 10, 99, 100, 101, 995, 1005, 12345, 99999, 123456, 1_000_000_07, -1, -99, -100, -12345];
    for (let i = 0; i < 2000; i++) grid.push(i * 37, -i * 41, i * 1009);
    for (const m of grid) expect(uah(m)).toBe(old(m));
  });
});
