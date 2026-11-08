import { describe, expect, it } from "vitest";
import { sameInvoiceHref, sameInvoiceLabel, type SameInvoice } from "./same-invoice";

const d = (over: Partial<SameInvoice>): SameInvoice =>
  ({ id: 1, title: "WESTLAB", status: "READY", createdAt: "2026-11-08T10:00:00Z", ...over }) as SameInvoice;

describe("та же накладная уже разбиралась", () => {
  it("черновик на проверке ведёт в черновик", () => {
    expect(sameInvoiceLabel(d({}))).toBe("Черновик №1 «WESTLAB» — ждёт проверки");
    expect(sameInvoiceHref(d({}))).toBe("/preorders/drafts/1");
  });

  it("принятая — в поставку", () => {
    const a = d({ status: "ACCEPTED", batchId: 5, title: null as unknown as string });
    expect(sameInvoiceLabel(a)).toBe("Поставка №5 — уже принята");
    expect(sameInvoiceHref(a)).toBe("/preorders/5");
  });
});
