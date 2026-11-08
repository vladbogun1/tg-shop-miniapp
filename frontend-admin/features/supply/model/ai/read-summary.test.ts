import { describe, expect, it } from "vitest";
import { EXTRACT_PROMPT, EXTRACT_PROMPT_VERSION, extractAdapter } from "./extract-prompt";
import { readDuration, readSummary, readSummaryText } from "./read-summary";

const ANSWER = JSON.stringify({
  supplier: "Shop",
  currency: "CNY",
  total: 30,
  lines: [
    { text: "Mouse pad", qty: 1, unitPrice: 10 },
    { text: "Cable", qty: 2, unitPrice: 10 },
    { text: "", qty: 1, unitPrice: 5 },
  ],
});

describe("extractAdapter", () => {
  it("gives the prompt, parses the answer and names the subjects", () => {
    expect(extractAdapter.buildPrompt()).toBe(EXTRACT_PROMPT);
    expect(EXTRACT_PROMPT_VERSION).toBe("supply-2");
    expect(extractAdapter.subjects([3, 7])).toEqual(["3", "7"]);
    expect(extractAdapter.parseAnswer(ANSWER).doc?.lines).toHaveLength(2);
  });
});

describe("readSummary", () => {
  it("counts the lines the parser dropped as not read", () => {
    const s = readSummary(extractAdapter.parseAnswer(ANSWER), null);
    expect(s).toEqual({ read: 2, total: 3, sumMatches: true });
    expect(readSummaryText(s!)).toBe("Прочитано 2 из 3, сумма сошлась");
  });

  it("says the sum does not match and stays silent when the document has no total", () => {
    const parsed = extractAdapter.parseAnswer(ANSWER);
    expect(readSummaryText(readSummary(parsed, "сумма строк 30, а итог 40")!)).toBe("Прочитано 2 из 3, сумма не сошлась");
    const noTotal = extractAdapter.parseAnswer(JSON.stringify({ currency: "USD", lines: [{ text: "A", qty: 1, unitPrice: 1 }] }));
    expect(readSummaryText(readSummary(noTotal, null)!)).toBe("Прочитано 1 из 1");
  });

  it("has nothing to say without a document", () => {
    expect(readSummary(null, null)).toBeNull();
    expect(readSummary(extractAdapter.parseAnswer("не json"), null)).toBeNull();
  });
});

describe("readDuration", () => {
  it("speaks in seconds for a quick read and in minutes for a slow one", () => {
    expect(readDuration(10)).toBe("около 10 секунд");
    expect(readDuration(3)).toBe("около 5 секунд");
    expect(readDuration(120)).toBe("около 2 минут");
  });
});
