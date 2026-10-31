import { describe, expect, it } from "vitest";
import { addRun, EMPTY_STATS, statLines } from "./test-stats";
import type { CaseItemAdmin, CaseTestDraw } from "./types";

const draw = (count: number, hits: { id: number; hits: number; chancePercent: number }[]) =>
  ({ count, hits }) as unknown as CaseTestDraw;

describe("addRun", () => {
  it("копит попадания и обновляет шансы", () => {
    const a = addRun(EMPTY_STATS, draw(10, [{ id: 1, hits: 7, chancePercent: 70 }, { id: 2, hits: 3, chancePercent: 30 }]));
    expect(a.restarted).toBe(false);
    const b = addRun(a.next, draw(5, [{ id: 1, hits: 2, chancePercent: 70 }, { id: 2, hits: 3, chancePercent: 30 }]));
    expect(b.next.n).toBe(15);
    expect(b.next.hits).toEqual({ 1: 9, 2: 6 });
    expect(b.next.chances).toEqual({ 1: 70, 2: 30 });
  });

  it("другие шансы начинают сессию заново", () => {
    const a = addRun(EMPTY_STATS, draw(10, [{ id: 1, hits: 10, chancePercent: 100 }]));
    const b = addRun(a.next, draw(4, [{ id: 1, hits: 2, chancePercent: 50 }, { id: 2, hits: 2, chancePercent: 50 }]));
    expect(b.restarted).toBe(true);
    expect(b.next.n).toBe(4);
    expect(b.next.hits).toEqual({ 1: 2, 2: 2 });
  });
});

describe("statLines", () => {
  it("сортирует по шансу, потом по id; «странным» считает отклонение больше 3σ только от 100 открытий", () => {
    const stats = { n: 1000, hits: { 1: 500, 2: 10 }, chances: { 1: 50, 2: 5 }, sig: "" };
    const lines = statLines(stats, new Map<number, CaseItemAdmin>());
    expect(lines.map((l) => l.id)).toEqual([1, 2]);
    expect(lines[0].odd).toBe(false);
    expect(lines[1].fact).toBe(1);
    expect(lines[1].odd).toBe(true);
    const few = statLines({ ...stats, n: 50 }, new Map());
    expect(few.every((l) => !l.odd)).toBe(true);
  });
});
