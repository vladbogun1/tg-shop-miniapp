import { describe, expect, it } from "vitest";
import { actionsFor, neighborId, pickAfterRemoval } from "./moderation";

describe("actionsFor", () => {
  it("матрица статус → действия", () => {
    expect(actionsFor("PENDING", false)).toEqual({ publish: true, hide: true, remove: false });
    expect(actionsFor("PUBLISHED", true)).toEqual({ publish: false, hide: true, remove: true });
    expect(actionsFor("HIDDEN", false)).toEqual({ publish: true, hide: false, remove: false });
  });
});

describe("pickAfterRemoval", () => {
  it("следующий, затем предыдущий", () => {
    expect(pickAfterRemoval([1, 2, 3], [1, 3], 2)).toBe(3);
    expect(pickAfterRemoval([1, 2, 3], [1, 2], 3)).toBe(2);
    expect(pickAfterRemoval([1], [], 1)).toBeNull();
  });
  it("выбранного не было — первый", () => {
    expect(pickAfterRemoval([1, 2], [2], 9)).toBe(2);
  });
});

describe("neighborId", () => {
  it("идёт по списку и не выходит за край", () => {
    expect(neighborId([1, 2, 3], 2, 1)).toBe(3);
    expect(neighborId([1, 2, 3], 3, 1)).toBe(3);
    expect(neighborId([1, 2, 3], 1, -1)).toBe(1);
    expect(neighborId([1, 2, 3], null, 1)).toBe(1);
    expect(neighborId([], 1, 1)).toBeNull();
  });
});
