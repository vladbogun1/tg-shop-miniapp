import { describe, expect, it } from "vitest";
import { cardVersion, confirmedSpecKeys, editReviewValue, extraInitialKeys, reviewRows, toProductSel, valuesOf } from "./ai-card";
import { cardChanges } from "./ai-conflict";
import { SCHEMA, item } from "./fixtures";
import { reviewProduct } from "./review";
import type { ProductReview } from "./types";
import { buildImportItem } from "./selection";
import { counts, initialSelection, outcomeCounts } from "@/features/ai";

function review(entry: unknown, it = item({ specs: { weight_g: 60 }, cardMeta: { fields: { weight_g: { c: 90 } } } })): ProductReview {
  const r = reviewProduct("p1", it, entry, SCHEMA);
  if ("problems" in r) throw new Error(r.problems.join());
  return r;
}
const noNeighbors = () => [] as number[];
const ctxOf = (neighbors = noNeighbors) => ({ changes: null, versionChanged: false, neighbors });

describe("cardVersion", () => {
  it("меняется при правке значения и не зависит от порядка ключей specs", () => {
    const a = item({ specs: { a: 1, b: 2 } });
    expect(cardVersion(a)).toBe(cardVersion(item({ specs: { b: 2, a: 1 } })));
    expect(cardVersion(a)).not.toBe(cardVersion(item({ specs: { a: 1, b: 3 } })));
    expect(valuesOf(a)["spec:a"]).toBe("1");
  });
});

describe("reviewRows", () => {
  it("пустое поле — «заполнит», старое значение ИИ — «заменит», ручное — под замком", () => {
    const it2 = item({ specs: { weight_g: 60, dpi: 800 }, cardMeta: { fields: { weight_g: { c: 90 } } } });
    const r = review({ specs: { weight_g: 55, dpi: 1600, sensor: "PAW3395" }, confidence: { weight_g: 90, dpi: 90, sensor: 90 }, overall: 90 }, it2);
    const rows = reviewRows(r, ctxOf());
    const by = (k: string) => rows.find((x) => x.key === `spec:${k}`)!;
    expect(by("sensor").before).toBeNull();
    expect(by("weight_g").before).not.toBeNull();
    expect(by("weight_g").humanLocked).toBe(false);
    expect(by("dpi").humanLocked).toBe(true);
  });

  it("число 256000 против 256 у соседей — красное, и число на кнопке его не считает", () => {
    const r = review({ specs: { weight_g: 256000, sensor: "x" }, confidence: { weight_g: 90, sensor: 90 }, overall: 90 });
    const rows = reviewRows(r, ctxOf(() => [60, 62, 58, 61]));
    const w = rows.find((x) => x.key === "spec:weight_g")!;
    expect(w.suspicion).toBe("bad");
    const all = new Set(rows.map((x) => x.key));
    expect(counts(rows, all).n).toBe(rows.filter((x) => x.key !== "spec:weight_g" && !x.humanLocked && !x.conflict).length);
  });

  it("конфликт с сервера: поле изменил Иван после старта — заблокировано, с именем и значениями в виде карточки", () => {
    const now = item({ specs: { weight_g: 70, dpi: 800 }, cardMeta: { fields: { weight_g: { c: 90 }, dpi: { c: 90 } } } });
    const r = review({ specs: { weight_g: 55, dpi: 1600 }, confidence: { weight_g: 90, dpi: 90 }, overall: 90 }, now);
    const server = { fields: [{ key: "spec:weight_g", before: "60", after: "70" }], editors: [{ name: "Иван", at: "2026-11-07T11:20:00Z" }] };
    const rows = reviewRows(r, { changes: cardChanges(server, now, SCHEMA), versionChanged: false, neighbors: noNeighbors });
    const weight = rows.find((x) => x.key === "spec:weight_g")!.conflict!;
    expect(weight).toMatch(/^Иван изменил «[^»]+» /);
    expect(weight).toContain("было 60 г → стало 70 г → ИИ предлагал 55 г");
    expect(rows.find((x) => x.key === "spec:dpi")!.conflict).toBeNull();
  });

  it("старая задача без снимка: при другом отпечатке замена выключена, пустое заполнить можно", () => {
    const now = item({ specs: { weight_g: 70 }, cardMeta: { fields: { weight_g: { c: 90 } } } });
    const r = review({ specs: { weight_g: 55, sensor: "PAW3395" }, confidence: { weight_g: 90, sensor: 90 }, overall: 90 }, now);
    const rows = reviewRows(r, { changes: null, versionChanged: true, neighbors: noNeighbors });
    expect(rows.find((x) => x.key === "spec:weight_g")!.conflict).toContain("замена выключена");
    expect(rows.find((x) => x.key === "spec:sensor")!.conflict).toBeNull();
  });
});

describe("выбор → запись", () => {
  it("в запись уходят ровно включённые характеристики", () => {
    const r = review({ specs: { sensor: "PAW3395" }, confidence: { sensor: 90 }, overall: 90 });
    const rows = reviewRows(r, ctxOf());
    const keys = new Set([...initialSelection(rows), ...extraInitialKeys(r, rows, false)]);
    const out = buildImportItem(r, toProductSel(r, keys, { translations: true }), { markReady: false });
    expect(Object.keys(out?.specs ?? {})).toEqual(["sensor"]);
    const none = buildImportItem(r, toProductSel(r, new Set(), { translations: false }), { markReady: false });
    expect(Object.keys(none?.specs ?? {})).toEqual([]);
  });

  it("подтверждённое без изменений: уверенность обновится только у значений ИИ, ручное не получает метку ИИ", () => {
    const it2 = item({ specs: { weight_g: 60, sensor: "PAW3395" }, cardMeta: { fields: { weight_g: { c: 50 } } } });
    const r = review({ specs: { weight_g: 60, sensor: "PAW3395", dpi: 1600 }, confidence: { weight_g: 95, sensor: 95, dpi: 90 }, overall: 90 }, it2);
    const rows = reviewRows(r, ctxOf());
    expect(rows.map((x) => x.key)).toEqual(["spec:dpi"]);
    expect(confirmedSpecKeys(r)).toEqual(["weight_g"]);
    const keys = new Set(["spec:dpi"]);
    const out = buildImportItem(r, toProductSel(r, keys, { translations: true, confirmed: true }), { markReady: false })!;
    expect(Object.keys(out.specs).sort()).toEqual(["dpi", "weight_g"]);
    expect(out.confidence).toEqual({ weight_g: 95, dpi: 90 });
    // пакет и прежние вызовы — без подтверждений
    expect(Object.keys(buildImportItem(r, toProductSel(r, keys, { translations: true }), { markReady: false })!.specs)).toEqual(["dpi"]);
  });
});

describe("правка в ревью", () => {
  const entry = { title: { ru: "Мышь X", uk: "Миша X", en: "Mouse X" }, specs: { weight_g: 55, sensor: "PAW3395" }, confidence: { weight_g: 90, sensor: 90 }, overall: 90 };

  it("поправленное значение уходит в запись, строка помечена «с правками», исход считает его edited", () => {
    const r = review(entry, item({}));
    const e1 = editReviewValue(r, "spec:weight_g", "62");
    const e2 = editReviewValue(e1.review, "title", "Мышь X Pro");
    expect([e1.error, e2.error]).toEqual([null, null]);
    const edited = new Set(["spec:weight_g", "title"]);
    const rows = reviewRows(e2.review, { ...ctxOf(), edited });
    const by = (k: string) => rows.find((x) => x.key === k)!;
    expect(by("spec:weight_g")).toMatchObject({ after: "62 г", edited: true, editable: "line" });
    expect(by("title")).toMatchObject({ after: "Мышь X Pro", edited: true });
    expect(by("spec:sensor").edited).toBe(false);

    const selected = new Set(["spec:weight_g", "spec:sensor"]);
    expect(outcomeCounts(rows, selected)).toMatchObject({ applied: 2, edited: 1 });

    const sel = toProductSel(e2.review, new Set([...selected, "title"]), { translations: true, photos: ["https://x.test/1.jpg"] });
    expect(sel.photos).toEqual(["https://x.test/1.jpg"]);
    const payload = buildImportItem(e2.review, sel, { markReady: false })!;
    expect(payload.specs).toMatchObject({ weight_g: 62, sensor: "PAW3395" });
    expect(payload.title).toBe("Мышь X Pro");
    // перевод делался для «Мышь X», а не для поправленного названия — не сохраняется
    expect(payload.translations?.uk?.title).toBeUndefined();
  });

  it("не прошло проверку или пусто — ничего не меняется", () => {
    const r = review(entry, item({}));
    expect(editReviewValue(r, "spec:weight_g", "много").review).toBe(r);
    expect(editReviewValue(r, "title", "  ").error).toBeTruthy();
    expect(editReviewValue(r, "category", "x").error).toBeTruthy();
  });
});
