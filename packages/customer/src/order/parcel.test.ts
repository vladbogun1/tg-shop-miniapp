import { describe, expect, it } from "vitest";
import { parcelStageColor, parcelStageKey, parcelStageOf } from "./parcel";
import { parcelTtn, trackingLink } from "./parcel-tracking";

describe("посылка", () => {
  it("стадия: известная из заказа или посылки, неизвестная — null", () => {
    expect(parcelStageOf({ shipmentStage: "ARRIVED" })).toBe("ARRIVED");
    expect(parcelStageOf({ shipment: { stage: "RECEIVED" } })).toBe("RECEIVED");
    expect(parcelStageOf({ shipmentStage: "WAT" })).toBeNull();
    expect(parcelStageOf({ shipmentStage: "toString" })).toBeNull();
    expect(parcelStageKey("ARRIVED")).toBe("parcel.stage.ARRIVED");
    expect(parcelStageColor("RECEIVED")).toBe("var(--ok)");
    expect((["CREATED", "IN_TRANSIT", "REFUSED", "NOT_FOUND"] as const).map(parcelStageColor)).toEqual(["var(--faint)", "var(--st-new)", "var(--warn)", "var(--danger)"]);
  });

  it("ТТН без пробелов; нет — null", () => {
    expect(parcelTtn({ trackingNumber: "2045 0000 1111" })).toBe("204500001111");
    expect(parcelTtn({ shipment: { ttn: "" } })).toBeNull();
  });

  it("«Відстежити»: ссылка сервера только http(s), иначе страница НП по ТТН", () => {
    expect(trackingLink({ trackingNumber: "123" })).toBe("https://novaposhta.ua/tracking/?cargo_number=123");
    expect(trackingLink({ trackingNumber: "123", trackingUrl: "javascript:alert(1)" })).toBe("https://novaposhta.ua/tracking/?cargo_number=123");
    expect(trackingLink({ trackingNumber: "123", trackingUrl: "https://example.org/t" })).toBe("https://example.org/t");
    expect(trackingLink({})).toBeNull();
  });
});
