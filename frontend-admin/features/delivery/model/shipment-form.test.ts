import { describe, expect, it } from "vitest";
import { boxError, documentsOffered, formFrom, presetMatches, submitBlocked, successMessage, toOptions } from "./shipment-form";
import type { ShipmentPreview } from "./types";

const preview = (over: Partial<ShipmentPreview> = {}): ShipmentPreview => ({
  orderId: "o1",
  shortId: "ab12",
  orderStatus: "APPROVED",
  serviceType: "WarehouseWarehouse",
  recipientLastName: "Шевченко",
  recipientFirstName: "Тарас",
  senderWarehouseRef: "w1",
  senderWarehouses: [],
  parcel: { weightG: 600, lengthMm: 200, widthMm: 150, heightMm: 100 },
  presets: [],
  declaredMinor: 150000,
  codMinor: 0,
  collectCod: false,
  problems: [],
  warnings: [],
  unpaid: false,
  amountDueMinor: 0,
  dryRun: true,
  ...over,
});

describe("форма ТТН", () => {
  it("из предпросмотра: см, гривны, получатель", () => {
    const f = formFrom(preview(), false);
    expect(f).toMatchObject({ sender: "w1", weight: "600", l: "20", w: "15", h: "10", declared: "1500", last: "Шевченко", first: "Тарас" });
  });
  it("правка берёт вес и коробку самой ТТН", () => {
    const p = preview({ existing: { ttn: "1", origin: "API", stage: "CREATED", codMinor: 0, weightG: 900, lengthMm: 300, widthMm: 200, heightMm: 100 } });
    expect(formFrom(p, true)).toMatchObject({ weight: "900", l: "30" });
    expect(formFrom(p, false)).toMatchObject({ weight: "600", l: "20" });
  });
  it("частичная коробка — ошибка и стороны не уходят", () => {
    const f = { ...formFrom(preview(), false), h: "" };
    expect(boxError(f)).not.toBeNull();
    expect(toOptions(f)).toMatchObject({ lengthMm: null, widthMm: null, heightMm: null });
    expect(boxError({ l: "", w: "", h: "" })).toBeNull();
  });
  it("в опции: мм, копейки, пусто → null", () => {
    const o = toOptions({ ...formFrom(preview(), false), declared: "", description: "  ", middle: "" });
    expect(o).toMatchObject({ weightG: 600, lengthMm: 200, declaredMinor: null, description: null, recipientMiddleName: null });
  });
  it("заготовка совпадает со сторонами", () => {
    expect(presetMatches({ l: "20", w: "15", h: "10" }, { name: "S", lengthMm: 200, widthMm: 150, heightMm: 100 })).toBe(true);
    expect(presetMatches({ l: "21", w: "15", h: "10" }, { name: "S", lengthMm: 200, widthMm: 150, heightMm: 100 })).toBe(false);
  });
  it("«Документи» — одно место до 1 кг", () => {
    const f = formFrom(preview(), false);
    expect(documentsOffered(f, preview())).toBe(true);
    expect(documentsOffered({ ...f, weight: "1500" }, preview())).toBe(false);
  });
});

describe("можно ли сохранить", () => {
  const form = formFrom(preview(), false);
  const base = { form, preview: preview(), mode: "create" as const, loading: false, loadError: null };
  it("всё в порядке", () => expect(submitBlocked(base)).toBe(false));
  it("пересчёт или ошибка", () => {
    expect(submitBlocked({ ...base, loading: true })).toBe(true);
    expect(submitBlocked({ ...base, loadError: "x" })).toBe(true);
  });
  it("проблемы блокируют", () => expect(submitBlocked({ ...base, preview: preview({ problems: ["нет телефона"] }) })).toBe(true));
  it("неоплаченный — только с галочкой", () => {
    const p = preview({ unpaid: true });
    expect(submitBlocked({ ...base, preview: p })).toBe(true);
    expect(submitBlocked({ ...base, preview: p, form: { ...form, allowUnpaid: true } })).toBe(false);
    expect(submitBlocked({ ...base, preview: p, mode: "edit" })).toBe(false);
  });
  it("уже есть ТТН — создать нельзя", () => {
    const p = preview({ existing: { ttn: "1", origin: "API", stage: "CREATED", codMinor: 0 } });
    expect(submitBlocked({ ...base, preview: p })).toBe(true);
    expect(submitBlocked({ ...base, preview: p, mode: "remake" })).toBe(false);
  });
});

describe("тост итога", () => {
  it("создание, новый номер, тот же номер", () => {
    expect(successMessage("create", null, { ttn: "2" })).toBe("ТТН 2 создана");
    expect(successMessage("remake", "1", { ttn: "2" })).toContain("Старая ТТН 1 удалена, новая — 2");
    expect(successMessage("edit", "1", { ttn: "1" })).toContain("ТТН 1 обновлена — напечатайте");
  });
});
