import { describe, expect, it } from "vitest";
import { buildBatchParts } from "./ai-batch";
import { item } from "./fixtures";
import { parseAnswer } from "./parse";
import { buildPrompt } from "./prompt";
import { buildReview } from "./review";
import { partMarks, planSend } from "./send";
import { buildWorkSet } from "./workset";

/** Фильтр «Язык: UK» (или EN): промпт, проверка и сохранение касаются только выбранного языка. */
const FENCE = "```";
const missing = { status: "MISSING" as const, text: null, origin: null };
const ws = buildWorkSet([item({ entityId: "1", ...missing })], [item({ entityId: "1", ...missing })]);
const id = ws.strings[0].id;
const ukOnly = `${FENCE}json\n{ "${id}": { "ru": "Ковер Attack Shark черный", "uk": "Килимок Attack Shark чорний" } }\n${FENCE}`;

describe("prompt for one language", () => {
  it("names the language for the server and asks the model for ru + uk only", () => {
    const text = buildPrompt([{ id: "t1", kind: "k", ru: "Ковер" }], 1, 1, ["uk"]);
    expect(text).toContain("Языки перевода: uk\n\n## Строки для перевода");
    expect(text).toContain("верни два текста");
    expect(text).toContain('значения — объекты с полями "ru", "uk" (строки)');
    expect(text).toContain('поле "en" не возвращай');
    expect(text).not.toContain('- "en" — перевод на английский');
  });

  it("both languages: three texts and both named", () => {
    const text = buildPrompt([{ id: "t1", kind: "k", ru: "Ковер" }], 1, 1);
    expect(text).toContain("Языки перевода: uk, en\n");
    expect(text).toContain("верни три текста");
    expect(text).not.toContain("Переводи только на");
  });

  it("the built-in batch carries the language in every part", () => {
    const parts = buildBatchParts(ws.strings, ["en"]);
    expect(parts).toHaveLength(1);
    expect(parts[0].prompt).toContain("Языки перевода: en\n");
  });
});

describe("review and saving of one language", () => {
  it("an answer without «en» is clean when only uk was asked", () => {
    const r = buildReview(parseAnswer(ukOnly), ws, ["uk"]);
    expect(r.rows[0]).toMatchObject({ level: "ok", langs: ["uk"] });
    // the same answer with both languages asked misses «en»
    expect(buildReview(parseAnswer(ukOnly), ws).rows[0].level).toBe("error");
  });

  it("only uk is sent to the server, English stays as it is", () => {
    const r = buildReview(parseAnswer(ukOnly), ws, ["uk"]);
    const { plan, fieldsTotal } = planSend(r.rows, new Set());
    expect(plan.byLocale.uk).toHaveLength(1);
    expect(plan.byLocale.en).toHaveLength(0);
    expect(fieldsTotal).toBe(1);
  });
});

describe("manual marks for the metrics", () => {
  const parts = [{ ids: ["ta", "tb"] }, { ids: ["tc"] }, { ids: ["td"] }];

  it("one mark per part a saved row came from, not repeated", () => {
    expect(partMarks(parts, new Set(["tb", "tc"]), new Set())).toEqual(["p1-ta", "p2-tc"]);
    expect(partMarks(parts, new Set(["ta", "td"]), new Set(["p1-ta"]))).toEqual(["p3-td"]);
    expect(partMarks(parts, new Set(), new Set())).toEqual([]);
  });
});
