import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { item, SCHEMA } from "./fixtures";
import { assignCardIds, type CardItem } from "./item";
import {
  changedSince,
  checkPart,
  clearDraft,
  isDraft,
  loadDraft,
  newDraft,
  partRange,
  partsOf,
  pendingReviews,
  progressText,
  saveDraft,
  sameIds,
  unanswered,
} from "./manual-batch";

const uuid = (n: number) => `${n.toString(16).padStart(8, "0")}-0000-4000-8000-000000000000`;
const items: CardItem[] = Array.from({ length: 10 }, (_, i) => item({ id: uuid(i + 1), title: `Мышь ${i + 1}` }));
const ids = assignCardIds(items.map((i) => i.id));
const answerFor = (list: CardItem[]) =>
  "```json\n" + JSON.stringify(Object.fromEntries(list.map((i) => [ids.get(i.id), { specs: { weight_g: 50 }, confidence: { weight_g: 90 }, overall: 90 }]))) + "\n```";

describe("manual batch: parts", () => {
  it("cuts the products into parts of 4 and names the range", () => {
    const d = newDraft(items);
    expect(partsOf(d.ids).map((p) => p.length)).toEqual([4, 4, 2]);
    expect(d.answers).toEqual(["", "", ""]);
    expect(partRange(d, 1)).toBe("Товары 5–8");
    expect(partRange(newDraft(items.slice(0, 9)), 2)).toBe("Товар 9");
    expect(progressText({ ...d, part: 1 }, 1, 4)).toBe("часть 2 из 3, вставлено 1 из 4");
  });

  it("the same set of products in any order continues the draft", () => {
    const d = newDraft(items.slice(0, 3));
    expect(sameIds(d, [uuid(3), uuid(1), uuid(2)])).toBe(true);
    expect(sameIds(d, [uuid(1), uuid(2)])).toBe(false);
  });

  it("an answer of the part counts only its products; another part's answer is reported", () => {
    const part = items.slice(4, 8);
    const ok = checkPart(answerFor(part.slice(0, 1)), part, 4, SCHEMA, ids);
    expect(ok.answered).toBe(1);
    expect(ok.errors).toEqual([]);
    expect(ok.products[0].item.id).toBe(uuid(5));

    const wrong = checkPart(answerFor(items.slice(0, 2)), part, 4, SCHEMA, ids);
    expect(wrong.answered).toBe(0);
    expect(wrong.errors[0]).toContain("не из этой части");

    expect(checkPart("", part, 4, SCHEMA, ids)).toMatchObject({ answered: 0, errors: [] });
    expect(checkPart("не json", part, 4, SCHEMA, ids).answered).toBe(0);
  });

  it("review waits for the parsed products that are not written yet; the rest are unanswered", () => {
    const d = newDraft(items.slice(0, 8));
    const checks = [checkPart(answerFor(items.slice(0, 2)), items.slice(0, 4), 4, SCHEMA, ids), checkPart(answerFor(items.slice(4, 5)), items.slice(4, 8), 4, SCHEMA, ids)];
    expect(pendingReviews(checks, [uuid(1)]).map((p) => p.item.id)).toEqual([uuid(2), uuid(5)]);
    expect(unanswered(d, checks)).toEqual([uuid(3), uuid(4), uuid(6), uuid(7), uuid(8)]);
  });

  it("a card edited after the start is flagged", () => {
    const d = newDraft(items.slice(0, 1));
    expect(changedSince(d, items[0])).toBe(false);
    expect(changedSince(d, { ...items[0], description: "Новое" })).toBe(true);
    expect(changedSince(d, items[1])).toBe(false);
  });
});

describe("manual batch: draft in localStorage", () => {
  const mem = new Map<string, string>();
  beforeEach(() => {
    mem.clear();
    vi.stubGlobal("window", {
      localStorage: { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("survives a reload and is cleared", () => {
    const d = { ...newDraft(items.slice(0, 5)), part: 1, answers: ["a", "b"] };
    expect(saveDraft(d)).toBe(true);
    expect(loadDraft()).toEqual(d);
    clearDraft();
    expect(loadDraft()).toBeNull();
  });

  it("a broken or foreign draft is not opened", () => {
    const d = newDraft(items.slice(0, 5));
    expect(isDraft(d)).toBe(true);
    expect(isDraft({ ...d, v: 2 })).toBe(false);
    expect(isDraft({ ...d, answers: [""] })).toBe(false);
    expect(isDraft({ ...d, part: 2 })).toBe(false);
    expect(isDraft({ ...d, ids: [] })).toBe(false);
    mem.set("cards-manual-batch-v1", "{oops");
    expect(loadDraft()).toBeNull();
  });
});
