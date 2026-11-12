import { describe, expect, it } from "vitest";
import { carries, newToken, withoutKey, withoutStale, withToken } from "./back-close-state";

const NEXT = { __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: { tree: 1 } };
const KEY = "__orderDrawer";

describe("back-close history state", () => {
  it("every opening gets its own token", () => {
    const a = newToken(() => 0.5);
    const b = newToken(() => 0.5);
    expect(a).not.toBe(b);
    expect(a.startsWith("bc:")).toBe(true);
  });

  it("reload with the card open: the legacy `true` marker is stale, Back from the new entry closes the card", () => {
    const afterReload = { ...NEXT, [KEY]: true };
    const cleaned = withoutStale(afterReload, KEY, new Set());
    expect(cleaned).toEqual(NEXT);
    const token = newToken();
    const pushed = withToken(cleaned, KEY, token);
    expect(carries(pushed, KEY, token)).toBe(true);
    // Back lands on the cleaned entry: it does not carry this opening's token → close.
    expect(carries(cleaned, KEY, token)).toBe(false);
    // Even uncleaned, the old marker is not this opening's.
    expect(carries(afterReload, KEY, token)).toBe(false);
  });

  it("a token left by an earlier opening (closed from outside, or before a reload) is stale", () => {
    const old = newToken();
    expect(withoutStale({ ...NEXT, [KEY]: old }, KEY, new Set())).toEqual(NEXT);
  });

  it("live tokens of other open overlays and Next's own keys are kept", () => {
    const group = newToken();
    const state = { ...NEXT, __inboxGroup: group, __somethingElse: true };
    expect(withoutStale(state, KEY, new Set([group]))).toBeNull();
  });

  it("the legacy `true` of another overlay's key is not ours to remove", () => {
    expect(withoutStale({ ...NEXT, __inboxGroup: true }, KEY, new Set())).toBeNull();
  });

  it("nothing to clean → null (no replaceState)", () => {
    expect(withoutStale(null, KEY, new Set())).toBeNull();
    expect(withoutStale(NEXT, KEY, new Set())).toBeNull();
  });

  it("closing from the UI pops only when the current entry is still this opening's", () => {
    const token = newToken();
    const ours = withToken(NEXT, KEY, token);
    expect(carries(ours, KEY, token)).toBe(true);
    // Already left (Back raced the ×, or another card reopened): no extra pop.
    expect(carries(NEXT, KEY, token)).toBe(false);
    expect(carries(withToken(NEXT, KEY, newToken()), KEY, token)).toBe(false);
    expect(carries(undefined, KEY, token)).toBe(false);
  });

  it("nested overlay entry keeps the parent's token; dropping ours leaves the rest", () => {
    const parent = newToken();
    const child = newToken();
    const e2 = withToken(withToken(NEXT, "__inboxGroup", parent), KEY, child);
    expect(carries(e2, "__inboxGroup", parent)).toBe(true);
    expect(withoutKey(e2, KEY)).toEqual({ ...NEXT, __inboxGroup: parent });
  });
});
