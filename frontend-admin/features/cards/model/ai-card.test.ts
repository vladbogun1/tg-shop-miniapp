import { describe, expect, it } from "vitest";
import { cardVersion, extraInitialKeys, reviewRows, toProductSel, valuesOf } from "./ai-card";
import { cardChanges } from "./ai-conflict";
import { SCHEMA, item } from "./fixtures";
import { reviewProduct } from "./review";
import type { ProductReview } from "./types";
import { buildImportItem } from "./selection";
import { counts, initialSelection } from "@/features/ai";

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
});
