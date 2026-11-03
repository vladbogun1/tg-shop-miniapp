import { describe, expect, it } from "vitest";
import { lockSheet } from "./scroll-lock";

function fakeDoc() {
  const attrs = new Set<string>();
  return {
    attrs,
    documentElement: {
      setAttribute: (n: string) => void attrs.add(n),
      removeAttribute: (n: string) => void attrs.delete(n),
    },
  };
}

describe("lockSheet", () => {
  it("keeps data-sheet until the last sheet closes, in any order", () => {
    const doc = fakeDoc();
    let scrollLocks = 0;
    const lockScroll = () => {
      scrollLocks++;
      return () => void scrollLocks--;
    };
    const product = lockSheet(doc, lockScroll);
    const compare = lockSheet(doc, lockScroll);
    product();
    product();
    expect(doc.attrs.has("data-sheet")).toBe(true);
    expect(scrollLocks).toBe(1);
    compare();
    expect(doc.attrs.has("data-sheet")).toBe(false);
    expect(scrollLocks).toBe(0);
  });
});
