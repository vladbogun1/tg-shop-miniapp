import { describe, expect, it } from "vitest";
import { aiSettingsChanges } from "./settings-history";

describe("history of the AI settings", () => {
  const entries = [
    { id: 3, createdAt: "2026-11-07T10:00:00Z", adminName: "Макс", details: "«Лимит в месяц»: 1000 цент $ → 2000 цент $; «Порог остатка»: 3 шт → 5 шт" },
    { id: 2, createdAt: "2026-11-06T10:00:00Z", adminName: "Вика", details: "«Порог остатка»: 2 шт → 3 шт" },
    { id: 1, createdAt: "2026-11-05T10:00:00Z", adminName: null, details: "«ИИ включён»: выключено → включено" },
  ];

  it("keeps only the changes of the AI fields, newest first", () => {
    expect(aiSettingsChanges(entries, ["Лимит в месяц", "ИИ включён"])).toEqual([
      { id: 3, at: "2026-11-07T10:00:00Z", who: "Макс", changes: ["«Лимит в месяц»: 1000 цент $ → 2000 цент $"] },
      { id: 1, at: "2026-11-05T10:00:00Z", who: "—", changes: ["«ИИ включён»: выключено → включено"] },
    ]);
  });

  it("a label that only starts like another one does not match", () => {
    expect(aiSettingsChanges([{ id: 9, createdAt: "x", details: "«Лимит в месяц ботов»: 1 → 2" }], ["Лимит в месяц"])).toEqual([]);
    expect(aiSettingsChanges(entries, ["Лимит в месяц", "ИИ включён"], 1)).toHaveLength(1);
  });
});
