/** Сторож: каждый код журнала админа (`audit.record("КОД", …)`) из Java имеет подпись в админке. */
import { expect, it } from "vitest";
import { AUDIT_CODE_PATTERNS, backendCodes } from "@/lib/backend-codes";
import { AUDIT_ACTION_LABEL } from "./audit-labels";

it("каждый код журнала админа имеет подпись", () => {
  const codes = backendCodes(AUDIT_CODE_PATTERNS);
  expect(codes.length).toBeGreaterThan(50); // регулярка не должна молча перестать находить коды
  expect(codes.filter((c) => !(c in AUDIT_ACTION_LABEL))).toEqual([]);
});
