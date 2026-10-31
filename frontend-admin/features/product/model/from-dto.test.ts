import { describe, expect, it } from "vitest";
import { fromAdminProductDto } from "./from-dto";
import type { AdminProductDto } from "./types";

const dto = (over: Record<string, unknown> = {}) =>
  ({
    id: "p1",
    title: "Мышь",
    description: null,
    priceMinor: 100,
    stock: 1,
    active: true,
    condition: null,
    images: [{ id: null, url: null, sortOrder: 0 }],
    variants: [{ id: null, name: "v", stock: 1, sortOrder: 0 }],
    tags: null,
    specs: { a: 1 },
    cardMeta: null,
    ...over,
  }) as unknown as AdminProductDto;

describe("fromAdminProductDto", () => {
  it("null в местах, где экран ждёт «нет», становится undefined", () => {
    const p = fromAdminProductDto(dto());
    expect(p.description).toBeUndefined();
    expect(p.condition).toBeUndefined();
    expect(p.tags).toBeUndefined();
    expect(p.images?.[0].url).toBeUndefined();
    expect(p.variants?.[0].id).toBeUndefined();
  });
  it("остальное идёт как пришло, в том числе незнакомые экрану поля и specIssues", () => {
    const p = fromAdminProductDto(dto({ description: "d", specIssues: [{ key: "k", reason: "r" }] }));
    expect(p).toMatchObject({ id: "p1", description: "d", priceMinor: 100, specs: { a: 1 } });
    expect(p.specIssues).toEqual([{ key: "k", reason: "r" }]);
  });
  it("отсутствующие images/variants остаются пустыми", () => {
    const p = fromAdminProductDto(dto({ images: undefined, variants: undefined }));
    expect(p.images).toBeUndefined();
    expect(p.variants).toBeUndefined();
  });
});
