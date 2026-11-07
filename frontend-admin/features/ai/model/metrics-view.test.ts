import { describe, expect, it } from "vitest";
import type { AiMetricsSummary } from "../api";
import { dayLabel, dayPoints, fastApplyText, monthLine, noEditsTile, shareTile, waitingTile, wasteTile } from "./metrics-view";

type Share = AiMetricsSummary["share"];
const share = (over: Partial<Share> = {}): Share => ({
  builtin: 8,
  manual: 2,
  builtinPercent: 80,
  manualBy: { CHOICE: 1, LIMIT: 1, FAILURE: 0 },
  ...over,
});

describe("вкладка «ИИ» в метриках", () => {
  it("строка месяца с прогнозом и без", () => {
    const m = { spentMinor: 1900, limitMinor: 42000, forecastMinor: 31000, percent: 4, freeSearchTotal: 0, freeSearchUsed: 0 };
    expect(monthLine(m)).toContain("прогноз на месяц");
    expect(monthLine({ ...m, forecastMinor: undefined })).not.toContain("прогноз");
  });

  it("доля встроенного показывает причины ручного пути", () => {
    const t = shareTile(share());
    expect(t.value).toBe("80 %");
    expect(t.hint).toContain("по выбору: 1");
    expect(t.hint).toContain("из-за лимита: 1");
    expect(t.hint).not.toContain("после сбоя");
  });

  it("нет ни встроенного, ни ручного: прочерк, а не 100 %", () => {
    expect(shareTile(share({ builtin: 0, manual: 0, manualBy: {} })).value).toBe("—");
  });

  it("«без правок» — две цифры и отдельно «не открыто»", () => {
    const t = noEditsTile({ fieldsPercent: 79, cardsPercent: 33, decided: 3, notOpened: 2 });
    expect(t.value).toBe("79 %");
    expect(t.hint).toBe("полей; карточек целиком 33 % из 3, не открыто 2");
    expect(noEditsTile({ fieldsPercent: 0, cardsPercent: 0, decided: 0, notOpened: 0 }).value).toBe("—");
  });

  it("«зря потрачено» перечисляет только то, что считается", () => {
    const t = wasteTile({
      wastedMinor: 200,
      waste: [
        { key: "NODATA", jobs: 2, costMinor: 200, counted: true },
        { key: "REJECTED", jobs: 5, costMinor: 500, counted: false },
        { key: "FAILED", jobs: 0, costMinor: 0, counted: true },
      ],
    });
    expect(t.hint).toBe("не нашёл данных: 2");
  });

  it("«ждёт проверки»: самый старый и устаревшие", () => {
    expect(waitingTile({ count: 0, oldestDays: 0, stale: 0 }).hint).toBe("всё разобрано");
    expect(waitingTile({ count: 14, oldestDays: 20, stale: 3 }).hint).toBe("самому старому 20 дн., старше двух недель: 3");
  });

  it("применено не глядя: молчит, пока крупных результатов нет", () => {
    expect(fastApplyText({ count: 0, of: 0 })).toBeNull();
    expect(fastApplyText({ count: 1, of: 4 })).toContain("1 из 4");
  });

  it("дни графика: подпись «07.11» и те же числа", () => {
    expect(dayLabel("2026-11-07")).toBe("07.11");
    const rows = [{ key: "2026-11-07", count: 1, accepted: 1, bad: 0, costMinor: 200, badMinor: 0, inputTokens: 0, outputTokens: 0 }];
    expect(dayPoints(rows)).toEqual([{ day: "2026-11-07", costMinor: 200, accepted: 1 }]);
  });
});
