import { describe, expect, it } from "vitest";
import { broadcastNumbers, broadcastStatus } from "./broadcast";
import { detailPairs } from "./details";
import { buildFilter, isFiltered, typeOptions } from "./filter";
import { customerLabel, errorLabel, recipientText, resultLabel, typeLabel } from "./labels";
import { resultTone } from "./tone";
import type { ActivityRow, BroadcastSummary } from "./types";

const row = (p: Partial<ActivityRow>): ActivityRow => ({ id: 1, createdAt: "", source: "BOT", type: "START", result: "OK", ...p });

describe("labels", () => {
  it("bot results read as delivery", () => {
    expect(resultLabel("OK", "BOT")).toBe("Доставлено");
    expect(resultLabel("FAILED", "BOT")).toBe("Не доставлено");
    expect(resultLabel("FAILED", "SITE")).toBe("Ошибка");
    expect(resultLabel("WEIRD")).toBe("WEIRD");
  });
  it("unknown codes fall back to the raw code", () => {
    expect(typeLabel("NOPE")).toBe("NOPE");
    expect(errorLabel("NOPE")).toBe("NOPE");
    expect(errorLabel("MONO_5001")).toBe("Банк: код 5001");
    expect(errorLabel("BOT_BLOCKED")).toBe("Бот заблокирован");
  });
  it("customerLabel: name, @username, #id, none", () => {
    expect(customerLabel(row({}))).toBeNull();
    expect(customerLabel(row({ tgUserId: 7 }))).toBe("#7");
    expect(customerLabel(row({ tgUserId: 7, customerUsername: "u" }))).toBe("@u");
    expect(customerLabel(row({ tgUserId: 7, customerUsername: "u", customerName: "Ann" }))).toBe("Ann");
  });
  it("resultTone", () => {
    expect([resultTone("OK"), resultTone("FAILED"), resultTone("SKIPPED")]).toEqual(["ok", "danger", "warn"]);
  });
});

describe("detailPairs", () => {
  it("labels keys, formats money and booleans", () => {
    expect(detailPairs(JSON.stringify({ promoCode: "X", premium: true, items: 2 }))).toEqual([
      ["Промокод", "X"],
      ["Premium", "да"],
      ["Позиций", "2"],
    ]);
    const [[k, v]] = detailPairs(JSON.stringify({ totalMinor: 12345 }));
    expect(k).toBe("Сумма");
    expect(v).toMatch(/123/);
  });
  it("bad or empty json gives no pairs", () => {
    expect(detailPairs("{oops")).toEqual([]);
    expect(detailPairs(null)).toEqual([]);
  });
});

describe("filter", () => {
  const empty = { source: "", type: "", result: "", recipient: "", errorCode: "", order: "", q: "", from: "", to: "" };
  it("drops empty fields", () => {
    const f = buildFilter(empty);
    expect(isFiltered(f)).toBe(false);
    expect(isFiltered(buildFilter({ ...empty, q: "a" }))).toBe(true);
    expect(buildFilter({ ...empty, customerId: 5 }).tgUserId).toBe(5);
  });
  it("type options follow the source and are unique", () => {
    const facets = { retentionDays: 1, errorCodes: [], types: [
      { source: "BOT", type: "START" }, { source: "SITE", type: "LOGIN" }, { source: "SITE", type: "START" },
    ] };
    expect(typeOptions(facets, "SITE").map((o) => o.value).sort()).toEqual(["LOGIN", "START"]);
    expect(typeOptions(facets, "").map((o) => o.value)).toHaveLength(2);
    expect(typeOptions(undefined, "")).toEqual([]);
  });
});

describe("broadcast", () => {
  const base = { broadcast: { id: 1, total: 10, sent: 7, failed: 2, blocked: 1, text: "<b>Hi</b>  <i>there</i>" }, group: "g", reasons: { A: 1, B: 3 } };
  it("uses the journal when it has recipients", () => {
    const n = broadcastNumbers({ ...base, delivered: 5, failed: 1, skipped: 1 } as unknown as BroadcastSummary);
    expect([n.delivered, n.notDelivered, n.pctOk, n.pctBad]).toEqual([5, 2, 50, 20]);
    expect(n.reasons[0][0]).toBe("B");
    expect(n.preview).toBe("Hi there");
  });
  it("falls back to broadcast counters for old broadcasts", () => {
    const n = broadcastNumbers({ ...base, delivered: 0, failed: 0, skipped: 0 } as unknown as BroadcastSummary);
    expect([n.journaled, n.delivered, n.notDelivered]).toEqual([0, 7, 3]);
  });
  it("status", () => {
    expect(broadcastStatus("RUNNING").label).toBe("Идёт");
    expect(broadcastStatus("DONE").tone).toBe("neutral");
  });
});

describe("recipientText", () => {
  it("customer by name, admins by label, unknown as is", () => {
    expect(recipientText("CUSTOMER", "Ann")).toBe("Ann");
    expect(recipientText("CUSTOMER", null)).toBe("покупателю");
    expect(recipientText("ADMINS", "Ann")).toBe("Админам");
    expect(recipientText("X", null)).toBe("X");
  });
});
