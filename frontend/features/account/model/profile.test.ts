import { describe, expect, it } from "vitest";
import { deriveInitials, displayNameOf } from "./profile";

describe("deriveInitials", () => {
  it("takes two letters from first and last name", () => expect(deriveInitials("ivan", "petrenko")).toBe("IP"));
  it("takes one from the first name, then from the username", () => {
    expect(deriveInitials("ivan")).toBe("I");
    expect(deriveInitials(undefined, undefined, "max")).toBe("M");
  });
  it("falls back to ?", () => expect(deriveInitials()).toBe("?"));
});

describe("displayNameOf", () => {
  it("prefers the full name, then the username, then the guest label", () => {
    expect(displayNameOf({ firstName: "A", lastName: "B", username: "u" }, "Guest")).toBe("A B");
    expect(displayNameOf({ username: "u" }, "Guest")).toBe("u");
    expect(displayNameOf(null, "Guest")).toBe("Guest");
  });
});
