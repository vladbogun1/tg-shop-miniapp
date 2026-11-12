import { describe, expect, it } from "vitest";
import { boxGlyph, type BoxGeometry } from "./box-glyph";

/** Все числа пути попарно (x y). */
function points(d: string): [number, number][] {
  const n = (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
  const out: [number, number][] = [];
  for (let i = 0; i + 1 < n.length; i += 2) out.push([n[i], n[i + 1]]);
  return out;
}

const five = { kind: "BOX", lengthMm: 400, widthMm: 240, heightsMm: [200, 130, 80] };

function box(cut?: number, size = 48): BoxGeometry {
  const g = boxGlyph(five, cut, size);
  if (g.kind !== "box") throw new Error("ожидалась коробка");
  return g;
}

describe("значок коробки", () => {
  it("вписан в квадрат с полями", () => {
    const g = box();
    const all = [g.front, g.top, g.side].flatMap(points);
    for (const [x, y] of all) {
      expect(x).toBeGreaterThanOrEqual(1.9);
      expect(x).toBeLessThanOrEqual(46.1);
      expect(y).toBeGreaterThanOrEqual(1.9);
      expect(y).toBeLessThanOrEqual(46.1);
    }
  });

  it("передняя грань пропорциональна Д×В", () => {
    const [a, b, c] = points(box().front);
    const w = b[0] - a[0];
    const h = b[1] - c[1];
    expect(w / h).toBeCloseTo(400 / 200, 1);
  });

  it("подрезанная до 13 см: передняя грань ниже, сверху бледный контур, линии сгиба 8 см под срезом", () => {
    const fullFront = points(box().front);
    const cut = box(130);
    const cutFront = points(cut.front);
    const hFull = fullFront[1][1] - fullFront[2][1];
    const hCut = cutFront[1][1] - cutFront[2][1];
    expect(hCut / hFull).toBeCloseTo(130 / 200, 1);
    expect(cut.ghost).not.toBeNull();
    expect(cut.folds).toHaveLength(1);
    expect(cut.folds[0].above).toBe(false);
  });

  it("во всю высоту: без бледной части, линии сгиба 13 и 8 см", () => {
    const g = box(200);
    expect(g.ghost).toBeNull();
    expect(g.folds.map((f) => f.above)).toEqual([false, false]);
  });

  it("подрезанная до 8 см: линия 13 см выше среза", () => {
    expect(box(80).folds.map((f) => f.above)).toEqual([true]);
  });

  it("высота не из списка или пусто — полная", () => {
    expect(box(999).ghost).toBeNull();
    expect(box(undefined).ghost).toBeNull();
  });

  it("пакет — плоский силуэт Д×Ш", () => {
    const g = boxGlyph({ kind: "BAG", lengthMm: 360, widthMm: 250, heightsMm: [] }, null, 40);
    expect(g.kind).toBe("bag");
    if (g.kind !== "bag") return;
    const [a, b, c] = points(g.body);
    expect((b[0] - a[0]) / (c[1] - b[1])).toBeCloseTo(360 / 250, 1);
  });
});
