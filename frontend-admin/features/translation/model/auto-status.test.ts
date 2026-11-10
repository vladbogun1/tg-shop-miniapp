import { describe, expect, it } from "vitest";
import type { TrAutoStatus } from "../api";
import { autoLine } from "./auto-status";

const base: TrAutoStatus = { configured: true, enabled: true, used: 120_000, limit: 500_000, reserve: 20_000, lastRun: null };
const run = (over: Partial<NonNullable<TrAutoStatus["lastRun"]>>) => ({
  ...base,
  lastRun: { at: "2026-11-10T10:00:00Z", written: 3, rejected: 0, charsSent: 400, charsWaiting: 0, error: null, ...over },
});

describe("autoLine", () => {
  it("без ключа — выключен и говорит, что задать", () => {
    const l = autoLine({ ...base, configured: false, used: null, limit: null });
    expect(l.tone).toBe("off");
    expect(l.text).toContain("DEEPL_API_KEY");
  });

  it("работает — показывает символы месяца и очередь", () => {
    const l = autoLine(run({ charsWaiting: 15_000 }));
    expect(l.tone).toBe("ok");
    expect(l.text).toContain("Автоперевод включён");
    expect(l.text).toMatch(/120\s000 из 500\s000/);
    expect(l.text).toMatch(/ждут очереди 15\s000/);
  });

  it("лимит месяца — предупреждение человеческими словами, код ошибки в подсказке", () => {
    const l = autoLine(run({ error: "QUOTA: 456 Quota exceeded" }));
    expect(l.tone).toBe("warn");
    expect(l.text).toContain("лимит месяца");
    expect(l.detail).toContain("QUOTA");
  });

  it("не прошедшие проверку — остаются для ручного перевода", () => {
    const l = autoLine(run({ rejected: 2 }));
    expect(l.tone).toBe("warn");
    expect(l.text).toContain("2 не прошли проверку");
  });
});
