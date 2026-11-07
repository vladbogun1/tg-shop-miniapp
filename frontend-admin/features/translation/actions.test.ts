import { beforeEach, describe, expect, it, vi } from "vitest";
import { confirmAsIs } from "./actions";
import { item } from "./model/fixtures";
import { buildWorkSet } from "./model/workset";

const accept = vi.hoisted(() => vi.fn());
vi.mock("./api", () => ({ translationApi: { accept } }));

const H = "1".repeat(64);

beforeEach(() => {
  accept.mockReset();
  accept.mockImplementation(async (items: unknown[]) => ({ accepted: items.length, skippedStale: 0, notFound: 0, invalid: 0 }));
});

describe("confirmAsIs", () => {
  it("подтверждает устаревший и непроверенный перевод, привязывая к текущему оригиналу", async () => {
    const ws = buildWorkSet(
      [item({ entityId: "a", sourceHash: H, status: "STALE" })],
      [item({ entityId: "a", sourceHash: H, status: "TRANSLATED", reviewed: false, text: "Mouse" })]
    );
    const r = await confirmAsIs(ws.strings, ["uk", "en"]);
    expect(r).toMatchObject({ done: 2, skipped: 0 });
    expect(accept.mock.calls[0][0].map((i: { locale: string }) => i.locale)).toEqual(["uk", "en"]);
  });

  it("пропускает язык, если в разных полях перевод разный или его нет", async () => {
    const ws = buildWorkSet(
      [item({ entityId: "a", sourceHash: H, text: "A" }), item({ entityId: "b", sourceHash: H, text: "B" })],
      [item({ entityId: "a", sourceHash: H, text: "X", reviewed: true }), item({ entityId: "b", sourceHash: H, status: "MISSING", text: null })]
    );
    const r = await confirmAsIs(ws.strings, ["uk", "en"]);
    expect(r.skipped).toBe(2);
    expect(accept).not.toHaveBeenCalled();
  });

  it("готовое не трогает", async () => {
    const ws = buildWorkSet([item({ entityId: "a", sourceHash: H, reviewed: true })], [item({ entityId: "a", sourceHash: H, reviewed: true })]);
    const r = await confirmAsIs(ws.strings, ["uk", "en"]);
    expect(r).toMatchObject({ done: 0, skipped: 0 });
  });
});
