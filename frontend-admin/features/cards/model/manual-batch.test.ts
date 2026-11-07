import { describe, expect, it } from "vitest";
import { cardVersion } from "./ai-card";
import { item, SCHEMA } from "./fixtures";
import { assignCardIds, type CardItem } from "./item";
import { checkPart, splitForManual, freshDraft, partAnswers, partRange, partsOf, pendingCount, progressText, readDraft, resize, resumeText, sameProducts, sortForBatch, unansweredOf } from "./manual-batch";
import { parseCardAnswer } from "./parse";
import { buildCardReview } from "./review";

const uuid = (n: number) => `${n.toString(16).padStart(8, "0")}-0000-4000-8000-000000000000`;
const items: CardItem[] = Array.from({ length: 10 }, (_, i) => item({ id: uuid(i + 1), title: `Мышь ${i + 1}` }));
const ids = assignCardIds(items.map((i) => i.id));
const entry = { specs: { weight_g: 50 }, confidence: { weight_g: 90 }, overall: 90 };
const answerFor = (list: CardItem[]) => "```json\n" + JSON.stringify(Object.fromEntries(list.map((i) => [ids.get(i.id), entry]))) + "\n```";

describe("manual batch: parts and draft", () => {
  it("orders the products by category and title, without a category last", () => {
    const list = [item({ id: "1", title: "Б", categorySlug: null }), item({ id: "2", title: "Я", categorySlug: "kovriki" }), item({ id: "3", title: "А", categorySlug: "kovriki" })];
    expect(sortForBatch(list, SCHEMA).map((i) => i.id)).toEqual(["3", "2", "1"]);
  });
  it("cuts the products into parts and names the range", () => {
    expect(partsOf(items.map((i) => i.id), 4).map((p) => p.length)).toEqual([4, 4, 2]);
    expect(partsOf(items.map((i) => i.id), 8).map((p) => p.length)).toEqual([8, 2]);
    expect(partRange(1, 4, 4)).toBe("Товары 5–8");
    expect(partRange(2, 4, 1)).toBe("Товар 9");
    expect(progressText({ part: 1, answers: ["", "", ""] }, 1, 4)).toBe("часть 2 из 3, вставлено 1 из 4");
  });

  it("a draft from the server is read back; a broken or foreign one starts fresh with the batch's part size", () => {
    const d = { ...freshDraft(10, 4), part: 1, answers: ["a", "b", ""], stage: "review" as const, model: "GPT-5" };
    expect(readDraft(JSON.stringify(d), 10, 4)).toEqual(d);
    expect(readDraft(null, 10, 8)).toEqual(freshDraft(10, 8));
    expect(readDraft("{oops", 10, 4)).toEqual(freshDraft(10, 4));
    expect(readDraft(JSON.stringify({ ...d, answers: ["a"] }), 10, 4)).toEqual(freshDraft(10, 4));
    expect(readDraft(JSON.stringify({ ...d, part: 3 }), 10, 4)).toEqual(freshDraft(10, 4));
    expect(readDraft(JSON.stringify({ ...d, v: 1 }), 10, 4)).toEqual(freshDraft(10, 4));
    // an old server draft without the model field
    expect(readDraft(JSON.stringify({ ...d, model: undefined }), 10, 4).model).toBe("");
  });

  it("the part size changes only while nothing is pasted", () => {
    const d = { ...freshDraft(10, 4), model: "o3" };
    expect(resize(d, 10, 8)).toEqual({ ...freshDraft(10, 8), model: "o3" });
    const pasted = { ...d, answers: ["x", "", ""] };
    expect(resize(pasted, 10, 8)).toBe(pasted);
  });
});

describe("manual batch: the answer of a part", () => {
  it("counts only the products of the part; another part's answer is reported", () => {
    const part = items.slice(4, 8);
    const ok = checkPart(answerFor(part.slice(0, 1)), part, 4, SCHEMA, ids);
    expect(ok.answered).toBe(1);
    expect(ok.errors).toEqual([]);
    expect(ok.products[0].item.id).toBe(uuid(5));

    const wrong = checkPart(answerFor(items.slice(0, 2)), part, 4, SCHEMA, ids);
    expect(wrong.answered).toBe(0);
    expect(wrong.perProduct.size).toBe(0);
    expect(wrong.errors[0]).toContain("не из этой части");

    expect(checkPart("", part, 4, SCHEMA, ids)).toMatchObject({ answered: 0, errors: [] });
    expect(checkPart("не json", part, 4, SCHEMA, ids).answered).toBe(0);
  });

  it("splits into one answer per product that reads back alone for that product, with the model", () => {
    const part = items.slice(0, 4);
    const c = checkPart(answerFor(part.slice(0, 2)), part, 4, SCHEMA, ids, "GPT-5 Thinking");
    expect([...c.perProduct.keys()]).toEqual([uuid(1), uuid(2)]);
    const one = c.perProduct.get(uuid(2)) ?? "";
    const alone = buildCardReview(parseCardAnswer(one), { schema: SCHEMA, items: [items[1]], ids: assignCardIds([uuid(2)]) });
    expect(alone.products.map((p) => p.item.id)).toEqual([uuid(2)]);
    expect(one).toContain('"model": "GPT-5 Thinking"');
    expect(checkPart(answerFor(part.slice(0, 1)), part, 4, SCHEMA, ids).perProduct.get(uuid(1))).not.toContain("model");
  });

  it("what goes to the server: the answer with the card version at the start of the batch", () => {
    const part = items.slice(0, 4);
    const c = checkPart(answerFor(part.slice(0, 2)), part, 4, SCHEMA, ids);
    const sent = partAnswers(c, new Map([[uuid(1), "v-start"]]), part);
    expect(sent.map((a) => [a.productId, a.subjectVersion])).toEqual([
      [uuid(1), "v-start"],
      [uuid(2), cardVersion(items[1])],
    ]);
    expect(sent[0].answer).toContain("```json");
  });
});

describe("manual batch: progress against the server's tasks", () => {
  const order = items.slice(0, 8).map((i) => i.id);
  const parts = partsOf(order, 4);

  it("counts the ready tasks of sent parts and the parsed products of parts changed since", () => {
    const changed = answerFor(items.slice(4, 6));
    const d = { answers: ["sent text", changed], sent: ["sent text", ""] };
    const checks = [null, checkPart(changed, items.slice(4, 8), 4, SCHEMA, ids)];
    const jobs = [
      { subjectId: uuid(1), status: "DONE", outcome: null },
      { subjectId: uuid(2), status: "DONE", outcome: "APPLIED" },
      { subjectId: uuid(5), status: "DONE", outcome: "REJECTED" },
    ];
    // part 1: p1 ready (p2 decided); part 2: p6 parsed (p5 decided stays decided)
    expect(pendingCount(parts, d, checks, jobs)).toBe(2);
    expect(unansweredOf(order, jobs)).toEqual([uuid(3), uuid(4), uuid(6), uuid(7), uuid(8)]);
  });

  it("the same products in another order are the same batch", () => {
    expect(sameProducts([uuid(1), uuid(2)], [uuid(2), uuid(1)])).toBe(true);
    expect(sameProducts([uuid(1), uuid(2)], [uuid(1)])).toBe(false);
    expect(sameProducts([uuid(1)], [uuid(1), uuid(3)])).toBe(false);
  });

  it("the resume line is built from the server's draft and tasks", () => {
    const jobs = [{ subjectId: uuid(5), status: "DONE", outcome: null }];
    const raw = JSON.stringify({ ...freshDraft(8, 4), part: 1 });
    expect(resumeText(raw, order, 4, jobs)).toBe("часть 2 из 2, вставлено 1 из 4");
    expect(resumeText(JSON.stringify({ ...freshDraft(8, 4), stage: "review" }), order, 4, jobs)).toBe("проверка, осталось 1");
    expect(resumeText(null, order, 8, [])).toBe("часть 1 из 1, вставлено 0 из 8");
  });
});

describe("больше 100 товаров — по пакетам", () => {
  it("первые 100 сейчас, остальные запоминаются в черновике и переживают чтение и смену размера части", () => {
    const all = Array.from({ length: 230 }, (_, i) => `p${i}`);
    const s = splitForManual(all, 100);
    expect(s.now).toHaveLength(100);
    expect(s.rest).toHaveLength(130);
    expect(s.batches).toBe(3);
    const d = freshDraft(100, 4, s.rest);
    expect(readDraft(JSON.stringify(d), 100, 4).rest).toEqual(s.rest);
    expect(resize(d, 100, 8).rest).toEqual(s.rest);
    expect(readDraft(JSON.stringify({ ...d, rest: "x" }), 100, 4).rest).toEqual([]);
  });

  it("до 100 — один пакет, хвоста нет", () => {
    const s = splitForManual(["a", "b"], 100);
    expect(s).toEqual({ now: ["a", "b"], rest: [], batches: 1 });
    expect(freshDraft(2).rest).toEqual([]);
  });
});
