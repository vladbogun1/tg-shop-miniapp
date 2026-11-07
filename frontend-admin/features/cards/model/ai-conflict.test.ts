import { describe, expect, it } from "vitest";
import { cardChanges } from "./ai-conflict";
import { SCHEMA, item } from "./fixtures";

const cat = SCHEMA.categories.find((c) => c.id)!;

describe("правки с сервера → вид строк ревью", () => {
  it("характеристика — в виде карточки, категория — slug, бренд — «стало» из карточки, «было» не назвать", () => {
    const now = item({ brand: "Razer" });
    const out = cardChanges(
      {
        fields: [
          { key: "spec:weight_g", before: "60", after: null },
          { key: "category", before: null, after: cat.id },
          { key: "brand", before: "0b6c9d2e-1111-4a8b-9c3d-2e4f5a6b7c8d", after: "1b6c9d2e-1111-4a8b-9c3d-2e4f5a6b7c8d" },
          { key: "description", before: "x".repeat(200), after: "Коротко" },
        ],
        editors: [{ name: "Иван", at: "2026-11-07T11:20:00Z" }],
      },
      now,
      SCHEMA,
    )!;
    expect(out.fields["spec:weight_g"]).toEqual({ before: "60 г", after: null });
    expect(out.fields.category).toEqual({ before: null, after: cat.slug });
    expect(out.fields.brand).toEqual({ before: undefined, after: "Razer" });
    expect(out.fields.description.before).toHaveLength(60);
    expect(out.editors).toEqual([{ name: "Иван", at: "2026-11-07T11:20:00Z" }]);
  });

  it("у задачи нет снимка — null (тогда работает старый признак: отпечаток)", () => {
    expect(cardChanges(null, item({}), SCHEMA)).toBeNull();
    expect(cardChanges(undefined, item({}), SCHEMA)).toBeNull();
  });
});
