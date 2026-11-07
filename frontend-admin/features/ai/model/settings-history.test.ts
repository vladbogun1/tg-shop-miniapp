import { describe, expect, it } from "vitest";
import { aiSettingsChanges, moneyChange } from "./settings-history";

describe("history of the AI settings", () => {
  const entries = [
    { id: 3, createdAt: "2026-11-07T10:00:00Z", adminName: "Макс", details: "«Лимит в месяц»: 1000 → 2000; «Порог остатка»: 3 шт → 5 шт" },
    { id: 2, createdAt: "2026-11-06T10:00:00Z", adminName: "Вика", details: "«Порог остатка»: 2 шт → 3 шт" },
    { id: 1, createdAt: "2026-11-05T10:00:00Z", adminName: null, details: "«ИИ включён»: выключено → включено" },
  ];

  it("keeps only the changes of the AI fields, newest first", () => {
    expect(aiSettingsChanges(entries, ["Лимит в месяц", "ИИ включён"])).toEqual([
      { id: 3, at: "2026-11-07T10:00:00Z", who: "Макс", changes: ["«Лимит в месяц»: 1000 → 2000"] },
      { id: 1, at: "2026-11-05T10:00:00Z", who: "—", changes: ["«ИИ включён»: выключено → включено"] },
    ]);
  });

  it("a label that only starts like another one does not match", () => {
    expect(aiSettingsChanges([{ id: 9, createdAt: "x", details: "«Лимит в месяц ботов»: 1 → 2" }], ["Лимит в месяц"])).toEqual([]);
    expect(aiSettingsChanges(entries, ["Лимит в месяц", "ИИ включён"], 1)).toHaveLength(1);
  });
});

describe("money limits in the history", () => {
  const money = ["Лимит в месяц", "Лимит в день"];

  it("shows cents as dollars with hryvnias at the current rate, like the field", () => {
    expect(moneyChange("«Лимит в месяц»: 1000 → 250", money, 4200)).toBe("«Лимит в месяц»: $10 ≈ 420 ₴ → $2,50 ≈ 105 ₴");
    expect(moneyChange("«Лимит в день»: 100 → по умолчанию (0)", money, 4200)).toBe("«Лимит в день»: $1 ≈ 42 ₴ → по умолчанию (без лимита)");
  });

  it("without a rate shows dollars only; other fields stay as the journal wrote them", () => {
    expect(moneyChange("«Лимит в день»: 100 → 250", money, null)).toBe("«Лимит в день»: $1 → $2,50");
    expect(moneyChange("«Максимум пакета»: 10 → 30", money, 4200)).toBe("«Максимум пакета»: 10 → 30");
  });
});
