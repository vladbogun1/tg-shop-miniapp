import { describe, expect, it } from "vitest";
import { parcelStageKey, parcelStageOf, parcelTone, parcelTtn, trackingLink } from "./parcel";

describe("посылка", () => {
  it("стадия: известная из заказа или посылки, неизвестная — null", () => {
    expect(parcelStageOf({ shipmentStage: "ARRIVED" })).toBe("ARRIVED");
    expect(parcelStageOf({ shipment: { stage: "RECEIVED" } })).toBe("RECEIVED");
    expect(parcelStageOf({ shipmentStage: "WAT" })).toBeNull();
    expect(parcelStageKey("ARRIVED")).toBe("parcel.stage.ARRIVED");
    expect(parcelTone("RECEIVED")).toBe("ok");
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
