import { describe, expect, it } from "vitest";
import type { AiSummary } from "../api";
import { aboutDuration, unavailableReason } from "./availability";

const ok: AiSummary = { configured: true, enabled: true, featuresOn: ["CARD"], limit: "", running: 0, review: 0, problems: 0 };

describe("unavailableReason", () => {
  it("можно, когда всё включено", () => expect(unavailableReason(ok, "CARD")).toBeNull());
  it("по очереди: ключ, общий выключатель, функция, лимит", () => {
    expect(unavailableReason({ ...ok, configured: false }, "CARD")).toBe("not-configured");
    expect(unavailableReason({ ...ok, enabled: false }, "CARD")).toBe("disabled");
    expect(unavailableReason(ok, "COMPLETION")).toBe("feature-off");
    expect(unavailableReason({ ...ok, limit: "DAY" }, "CARD")).toBe("limit-day");
    expect(unavailableReason({ ...ok, limit: "MONTH" }, "CARD")).toBe("limit-month");
  });
  it("без сводки: грузится — undefined, сбой — нет связи", () => {
    expect(unavailableReason(undefined, "CARD")).toBeUndefined();
    expect(unavailableReason(undefined, "CARD", true)).toBe("no-connection");
  });
});

describe("aboutDuration", () => {
  it("минута и больше", () => {
    expect(aboutDuration(40)).toBe("около минуты");
    expect(aboutDuration(180)).toBe("около 3 минут");
    expect(aboutDuration(60 * 21)).toBe("около 21 минуты");
  });
});
