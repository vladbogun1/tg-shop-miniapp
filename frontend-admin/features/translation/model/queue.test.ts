import { describe, expect, it } from "vitest";
import { item } from "./fixtures";
import {
  bucketOf,
  currentText,
  fieldState,
  langsOf,
  langState,
  matchesSearch,
  matchesType,
  placeOf,
  planAccept,
  prevSourceOf,
  staleManual,
} from "./queue";
import { assignIds, buildWorkSet } from "./workset";

const H1 = "1".repeat(64);
const H2 = "2".repeat(64);

describe("корзины", () => {
  const ws = buildWorkSet(
    [
      item({ entityId: "a", sourceHash: H1, status: "TRANSLATED", reviewed: true }),
      item({ entityId: "b", sourceHash: H2, status: "STALE", prevSource: "старый", origin: "MANUAL", reviewed: true }),
    ],
    [
      item({ entityId: "a", sourceHash: H1, status: "TRANSLATED", reviewed: false }),
      item({ entityId: "b", sourceHash: H2, status: "MISSING", text: null, origin: null }),
    ]
  );
  const [s1, s2] = ws.strings;

  it("состояние поля: MISSING → missing, STALE → stale, не проверен → review, иначе done", () => {
    expect(fieldState(s1.fields[0], "uk")).toBe("done");
    expect(fieldState(s1.fields[0], "en")).toBe("review");
    expect(fieldState(s2.fields[0], "uk")).toBe("stale");
    expect(fieldState(s2.fields[0], "en")).toBe("missing");
  });

  it("текст — в худшей корзине по выбранным языкам", () => {
    expect(bucketOf(s1, ["uk"])).toBe("done");
    expect(bucketOf(s1, ["uk", "en"])).toBe("review");
    expect(bucketOf(s2, ["uk"])).toBe("stale");
    expect(bucketOf(s2, langsOf("all"))).toBe("missing");
    expect(langState(s2, "en")).toBe("missing");
  });

  it("currentText: актуальный перевод, иначе устаревший, иначе пусто", () => {
    expect(currentText(s1, "uk")).toBe("Килимок Attack Shark чорний");
    expect(currentText(s2, "uk")).toBe("Килимок Attack Shark чорний");
    expect(currentText(s2, "en")).toBe("");
  });

  it("prevSourceOf и staleManual", () => {
    expect(prevSourceOf(s2, ["uk", "en"])).toBe("старый");
    expect(prevSourceOf(s1, ["uk", "en"])).toBeNull();
    expect(staleManual(s2, "uk")).toHaveLength(1);
    expect(staleManual(s2, "en")).toHaveLength(0);
  });
});

describe("фильтры и подписи", () => {
  const ws = buildWorkSet(
    [
      item({ entityId: "c", entityType: "CATEGORY", field: "name", productTitle: "Мыши", sourceHash: H1, source: "Мыши" }),
      item({ entityId: "v", entityType: "VARIANT", field: "name", productTitle: "Ковер", sourceHash: H2, source: "Новые" }),
    ],
    []
  );
  const [cat, variant] = ws.strings;

  it("тип «Товары и варианты» берёт и PRODUCT, и VARIANT", () => {
    expect(matchesType(variant, "PRODUCT")).toBe(true);
    expect(matchesType(cat, "PRODUCT")).toBe(false);
    expect(matchesType(cat, "CATEGORY")).toBe(true);
    expect(matchesType(cat, "")).toBe(true);
  });

  it("поиск по оригиналу, названию товара и переводам, без учёта регистра", () => {
    expect(matchesSearch(cat, "мыш")).toBe(true);
    expect(matchesSearch(variant, "ковер")).toBe(true);
    expect(matchesSearch(variant, "чорний")).toBe(true);
    expect(matchesSearch(variant, "нет такого")).toBe(false);
  });

  it("placeOf: человеческое место использования", () => {
    expect(placeOf(cat.fields[0])).toBe("Категория «Мыши»");
    expect(placeOf(variant.fields[0])).toBe("«Ковер»");
    expect(placeOf({ ...cat.fields[0], entityType: "PAYMENT_OPTION" })).toBe("Способ оплаты");
    expect(placeOf({ ...cat.fields[0], entityType: "REPLY_TEMPLATE", productTitle: "Ваша ТТН" })).toBe("Шаблон чата «Ваша ТТН»");
    expect(placeOf({ ...cat.fields[0], entityType: "NEW_TYPE" as never, productTitle: "X" })).toBe("NEW_TYPE «X»");
  });
});

describe("planAccept", () => {
  it("поле без этого текста пишется, поле с ним — подтверждается, если не проверено", () => {
    const ws = buildWorkSet(
      [
        item({ entityId: "a", sourceHash: H1, text: "T", reviewed: false }),
        item({ entityId: "b", sourceHash: H1, text: "T", reviewed: true }),
        item({ entityId: "c", sourceHash: H1, text: "Другой", reviewed: true }),
        item({ entityId: "d", sourceHash: H1, status: "MISSING", text: null, origin: null }),
      ],
      []
    );
    const plan = planAccept(ws.strings[0], "uk", "T");
    expect(plan.accept.map((a) => a.entityId)).toEqual(["a"]);
    expect(plan.write.map((w) => w.entityId)).toEqual(["c", "d"]);
    expect(plan.write[0]).toMatchObject({ text: "T", sourceHash: H1, field: "title" });
    expect(plan.accept[0].locale).toBe("uk");
  });
});

describe("assignIds", () => {
  it("id = t + кратчайший уникальный префикс хеша (минимум 6 символов)", () => {
    const ids = assignIds(["abcdef123", "abcdef456", "zzz000111"]);
    expect(ids.get("abcdef123")).toBe("tabcdef1");
    expect(ids.get("abcdef456")).toBe("tabcdef4");
    expect(ids.get("zzz000111")).toBe("tzzz000");
  });
});
