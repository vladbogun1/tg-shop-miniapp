import { describe, expect, it } from "vitest";
import { isSendDisabled, isTooLong, showCounter } from "./composer";

describe("isTooLong / showCounter", () => {
  it("never too long without a limit", () => {
    expect(isTooLong("x".repeat(5000), undefined)).toBe(false);
    expect(showCounter("x".repeat(5000), undefined)).toBe(false);
  });
  it("counts the trimmed text against the limit", () => {
    expect(isTooLong("  abc  ", 3)).toBe(false);
    expect(isTooLong("abcd", 3)).toBe(true);
  });
  it("shows the counter from 80 %", () => {
    expect(showCounter("x".repeat(80), 100)).toBe(false);
    expect(showCounter("x".repeat(81), 100)).toBe(true);
  });
});

describe("isSendDisabled", () => {
  const ok = { text: "hi", sending: false, uploading: false, sendWhileUploading: false, tooLong: false };
  it("is enabled with text", () => expect(isSendDisabled(ok)).toBe(false));
  it("is disabled when empty, sending or too long", () => {
    expect(isSendDisabled({ ...ok, text: "  " })).toBe(true);
    expect(isSendDisabled({ ...ok, sending: true })).toBe(true);
    expect(isSendDisabled({ ...ok, tooLong: true })).toBe(true);
  });
  it("stays live while a photo uploads only where the chat allows it", () => {
    expect(isSendDisabled({ ...ok, text: "", uploading: true })).toBe(true);
    expect(isSendDisabled({ ...ok, text: "", uploading: true, sendWhileUploading: true })).toBe(false);
  });
});
