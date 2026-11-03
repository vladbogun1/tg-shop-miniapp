import { describe, expect, it } from "vitest";
import { lockPageScroll } from "./overlay-stack";

const fakeDoc = () => ({ body: { style: { overflow: "" } } });

describe("lockPageScroll", () => {
  it("product view → comparison: the first lock is released first, the page scrolls after both", () => {
    const doc = fakeDoc();
    const product = lockPageScroll(doc);
    const compare = lockPageScroll(doc);
    expect(doc.body.style.overflow).toBe("hidden");
    product(); // the product view finishes fading out while the comparison is open
    expect(doc.body.style.overflow).toBe("hidden");
    compare();
    expect(doc.body.style.overflow).toBe("");
  });

  it("a double release counts once", () => {
    const doc = fakeDoc();
    const a = lockPageScroll(doc);
    const b = lockPageScroll(doc);
    a();
    a();
    expect(doc.body.style.overflow).toBe("hidden");
    b();
    expect(doc.body.style.overflow).toBe("");
  });
});
