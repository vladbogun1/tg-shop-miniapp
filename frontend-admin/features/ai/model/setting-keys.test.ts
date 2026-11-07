import { describe, expect, it } from "vitest";
import { AI_BLOCKS, blockKeys, unlistedKeys } from "./setting-keys";

describe("ключи настроек ИИ", () => {
  it("блоки не пересекаются", () => {
    const all = Object.values(AI_BLOCKS).flat();
    expect(new Set(all).size).toBe(all.length);
  });

  it("ключ, которого нет в блоках, не теряется", () => {
    expect(unlistedKeys(["ai.enabled", "ai.newThing"])).toEqual(["ai.newThing"]);
    expect(unlistedKeys([...blockKeys("limits")])).toEqual([]);
  });
});
