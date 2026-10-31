import { describe, expect, it } from "vitest";
import { moveRow, newRow, optionsSnapshot, prepayMinor, saveBlocker, toPayload, toRows, type OptionRow } from "./options";

const row = (over: Partial<OptionRow>): OptionRow => ({ ...newRow(), title: "Онлайн", ...over });

describe("prepayMinor", () => {
  it("запятая и точка", () => {
    expect(prepayMinor(row({ prepaymentMajor: "100,5" }))).toBe(10050);
    expect(prepayMinor(row({ prepaymentMajor: "100.50" }))).toBe(10050);
  });
  it("пусто, ноль, минус и мусор — 0", () => {
    for (const v of ["", "0", "-5", "abc"]) expect(prepayMinor(row({ prepaymentMajor: v }))).toBe(0);
  });
});

describe("saveBlocker", () => {
  it("не загружено", () => expect(saveBlocker([row({})], false)).toBe("Настройки не загружены"));
  it("нет включённых", () => expect(saveBlocker([row({ active: false })], true)).toMatch(/хотя бы один/));
  it("пустое название у строки с описанием или id", () => {
    expect(saveBlocker([row({}), row({ title: "", description: "x" })], true)).toMatch(/название/);
    expect(saveBlocker([row({}), row({ title: "", id: "a" })], true)).toMatch(/название/);
  });
  it("пустая строка без данных не мешает", () => expect(saveBlocker([row({}), row({ title: "" })], true)).toBeNull());
  it("предоплата без суммы", () => expect(saveBlocker([row({ requiresPrepayment: true })], true)).toMatch(/предоплаты/));
  it("всё в порядке", () => expect(saveBlocker([row({ requiresPrepayment: true, prepaymentMajor: "100" })], true)).toBeNull());
});

describe("toPayload", () => {
  it("пропускает безымянные, чистит пробелы, предоплата только при флаге", () => {
    const rows = [row({ title: " A ", description: " ", prepaymentMajor: "50" }), row({ title: "" }), row({ title: "B", requiresPrepayment: true, prepaymentMajor: "50" })];
    expect(toPayload(rows)).toEqual([
      { id: undefined, title: "A", description: undefined, requiresPrepayment: false, prepaymentMinor: null, active: true },
      { id: undefined, title: "B", description: undefined, requiresPrepayment: true, prepaymentMinor: 5000, active: true },
    ]);
  });
});

describe("moveRow / snapshot / toRows", () => {
  const a = row({ key: "a" });
  const b = row({ key: "b" });
  it("двигает и держит границы", () => {
    expect(moveRow([a, b], "a", 1).map((r) => r.key)).toEqual(["b", "a"]);
    expect(moveRow([a, b], "a", -1)).toEqual([a, b]);
    expect(moveRow([a, b], "zz", 1)).toEqual([a, b]);
  });
  it("снимок не зависит от ключей", () => expect(optionsSnapshot([{ ...a, key: "1" }])).toBe(optionsSnapshot([{ ...a, key: "2" }])));
  it("toRows: выключенный и предоплата", () => {
    const [r] = toRows([{ id: "x", title: "T", description: "", requiresPrepayment: true, prepaymentMinor: 10050, active: false, sortOrder: 0 }]);
    expect(r).toMatchObject({ id: "x", prepaymentMajor: "100.5", active: false, key: "x" });
  });
});
