import { describe, expect, it } from "vitest";
import { withQuery } from "./with-query";

describe("withQuery", () => {
  it("сохраняет параметры старого адреса", () => {
    expect(withQuery("/settings/payment", {})).toBe("/settings/payment");
    expect(withQuery("/settings/payment", { tab: "params", x: ["1", "2"], none: undefined })).toBe("/settings/payment?tab=params&x=1&x=2");
  });
});
