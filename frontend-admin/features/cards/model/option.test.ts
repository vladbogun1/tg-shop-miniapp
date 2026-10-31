import { describe, expect, it } from "vitest";
import { optionsWithNew } from "./option";
import { SCHEMA } from "./fixtures";
import { attributesForCategory } from "./schema";

describe("optionsWithNew", () => {
  const color = attributesForCategory(SCHEMA, "myshki-wireless").find((a) => a.key === "color")!;
  it("старые опции целиком, новая в конце; пустые подписи берут русскую; алиасы чистятся", () => {
    const out = optionsWithNew(color, { value: "red", labelRu: " Красный ", labelUk: "", labelEn: "", aliases: "красный, червоний\n red ,," });
    expect(out.length).toBe(color.options.length + 1);
    expect(out.slice(0, -1).map((o) => o.value)).toEqual(color.options.map((o) => o.value));
    expect(out[out.length - 1]).toEqual({ value: "red", labelRu: "Красный", labelUk: "Красный", labelEn: "Красный", aliases: "красный\nчервоний\nred" });
    expect(out[0].aliases).toBe(color.options[0].aliases.join("\n"));
  });
});
