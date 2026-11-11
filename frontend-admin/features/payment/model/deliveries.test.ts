import { describe, expect, it } from "vitest";
import { ALL_DELIVERIES, deliveriesCsv, parseDeliveries, toggleDelivery } from "./deliveries";

describe("доставки способа оплаты", () => {
  it("пусто и null — все", () => {
    expect(parseDeliveries(null)).toEqual(ALL_DELIVERIES);
    expect(parseDeliveries("")).toEqual(ALL_DELIVERIES);
  });
  it("CSV в любом регистре и порядке, неизвестное отбрасывается", () => {
    expect(parseDeliveries(" pickup ,WAREHOUSE,xx")).toEqual(["WAREHOUSE", "PICKUP"]);
  });
  it("все четыре уходят пустой строкой, часть — CSV по порядку", () => {
    expect(deliveriesCsv([...ALL_DELIVERIES])).toBe("");
    expect(deliveriesCsv(["PICKUP", "DOORS"])).toBe("DOORS,PICKUP");
  });
  it("последнюю выбранную не снять", () => {
    expect(toggleDelivery(["DOORS"], "DOORS")).toEqual(["DOORS"]);
    expect(toggleDelivery(["DOORS"], "WAREHOUSE")).toEqual(["WAREHOUSE", "DOORS"]);
    expect(toggleDelivery(ALL_DELIVERIES, "PICKUP")).toEqual(["WAREHOUSE", "POSTOMAT", "DOORS"]);
  });
});
