import { describe, expect, it } from "vitest";
import type { AiBatch } from "@/features/ai";
import { batchResult, buildBatchParts, partsCaption, resultText, translationAdapter } from "./ai-batch";
import { item } from "./fixtures";
import { hasBuiltinAiDraft } from "./queue";
import { buildWorkSet, type UniqueString } from "./workset";

function strings(n: number): UniqueString[] {
  const rows = Array.from({ length: n }, (_, i) =>
    item({ entityId: `e${i}`, sourceHash: i.toString(16).padStart(64, "0"), source: `Текст ${i}`, status: "MISSING", text: null, origin: null })
  );
  return buildWorkSet(rows, rows).strings;
}

describe("части для пакета", () => {
  it("60 строк — одна часть, 61 — две: 60 и 1", () => {
    expect(buildBatchParts(strings(60)).map((p) => p.strings)).toEqual([60]);
    expect(buildBatchParts(strings(61)).map((p) => p.strings)).toEqual([60, 1]);
  });

  it("части нумеруются с 1 и несут промпт со своими id", () => {
    const s = strings(130);
    const parts = buildBatchParts(s);
    expect(parts.map((p) => p.part)).toEqual([1, 2, 3]);
    expect(parts[0].prompt).toContain(`"${s[0].id}"`);
    expect(parts[0].prompt).not.toContain(`"${s[100].id}"`);
    expect(parts[2].prompt).toContain("часть 3 из 3");
  });

  it("адаптер отдаёт id строк и тот же разбор ответа, что у ручного пути", () => {
    const s = strings(2);
    expect(translationAdapter.subjects(s)).toEqual(s.map((x) => x.id));
    const answer = `\`\`\`json\n{"${s[0].id}": {"ru": "a", "uk": "б", "en": "c"}}\n\`\`\``;
    expect(translationAdapter.parseAnswer(answer).entries.get(s[0].id)?.uk).toBe("б");
  });

  it("подпись под кнопкой: части и минуты", () => {
    expect(partsCaption(buildBatchParts(strings(150)))).toBe("3 части по 60 строк · около 2 минут");
    expect(partsCaption(buildBatchParts(strings(5)))).toBe("5 строк · около минуты");
  });
});

function batch(over: Partial<AiBatch>, jobs: Partial<AiBatch["jobs"][number]>[]): AiBatch {
  return {
    id: 1,
    feature: "TRANSLATION",
    status: "DONE",
    total: jobs.length,
    queued: 0,
    running: 0,
    done: jobs.length,
    failed: 0,
    badAnswer: 0,
    retryable: 0,
    jobs: jobs.map((j, i) => ({ id: i, subjectId: `${i}-x`, status: "DONE", applied: 0, rejected: 0, ignored: 0, ...j })),
    ...over,
  } as unknown as AiBatch;
}

describe("итог пакета", () => {
  it("складывает исходы задач: новых, не заменено ручных, ошибок", () => {
    const r = batchResult(batch({}, [{ applied: 40, ignored: 2 }, { applied: 39, ignored: 3, rejected: 0 }]));
    expect(r).toEqual({ applied: 79, rejected: 0, ignored: 5, failedParts: 0, finished: true });
    expect(resultText(r)).toBe("79 новых · 5 не заменены (ручные) · 0 ошибок");
  });

  it("сбойные части — отдельным словом; идущий пакет не закончен", () => {
    const r = batchResult(batch({ status: "RUNNING", failed: 1, badAnswer: 1 }, [{ applied: 1 }]));
    expect(r.finished).toBe(false);
    expect(resultText(r)).toContain("2 части не получились");
  });
});

describe("фильтр «Встроенный ИИ»", () => {
  it("виден только черновик ИИ, который ждёт человека", () => {
    const own = buildWorkSet([item({ entityId: "a", builtinAi: true })], [item({ entityId: "a", builtinAi: true })]).strings[0];
    const accepted = buildWorkSet([item({ entityId: "a", builtinAi: true, reviewed: true })], [item({ entityId: "a", builtinAi: true, reviewed: true })]).strings[0];
    const chatgpt = buildWorkSet([item({ entityId: "a" })], [item({ entityId: "a" })]).strings[0];
    expect(hasBuiltinAiDraft(own, ["uk", "en"])).toBe(true);
    expect(hasBuiltinAiDraft(accepted, ["uk", "en"])).toBe(false);
    expect(hasBuiltinAiDraft(chatgpt, ["uk", "en"])).toBe(false);
  });
});
