import { describe, expect, it } from "vitest";
import type { SupportThread } from "@shop/core/support";
import { threadHeader } from "./header";

const thread = { status: "OPEN", productTitle: "Mouse", subject: "Q", productImageUrl: "img" } as SupportThread;

describe("threadHeader", () => {
  it("uses the thread product and allows closing an open thread", () => {
    expect(threadHeader(thread, undefined, false, "General")).toMatchObject({
      title: "Mouse",
      productImage: "img",
      closed: false,
      canClose: true,
    });
  });
  it("cannot close a closed thread or a draft", () => {
    expect(threadHeader({ ...thread, status: "CLOSED" }, undefined, false, "G").canClose).toBe(false);
    expect(threadHeader(undefined, { title: "Pad", images: [{ url: "p" }] }, true, "New")).toMatchObject({
      title: "Pad",
      productImage: "p",
      canClose: false,
    });
  });
  it("falls back to subject, then to the given title", () => {
    expect(threadHeader({ ...thread, productTitle: null }, undefined, false, "G").title).toBe("Q");
    expect(threadHeader(undefined, undefined, true, "New").title).toBe("New");
  });
});
