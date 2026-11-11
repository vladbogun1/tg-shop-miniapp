import { describe, expect, it } from "vitest";
import { boxText, cmText, dayText, intOrNull, intText, maskTin, toMm, weightText } from "./format";
import { serviceLabel, shipmentEditable, stageLabel, stageTone } from "./labels";

describe("числа форм НП", () => {
  it("intOrNull: пусто, ноль и мусор — null", () => {
    expect(intOrNull("")).toBeNull();
    expect(intOrNull("0")).toBeNull();
    expect(intOrNull("abc")).toBeNull();
    expect(intOrNull(" 250 ")).toBe(250);
    expect(intOrNull("1,6")).toBe(2);
  });
  it("intText", () => {
    expect(intText(null)).toBe("");
    expect(intText(0)).toBe("");
    expect(intText(300)).toBe("300");
  });
  it("weightText: граммы и килограммы", () => {
    expect(weightText(300)).toBe("300 г");
    expect(weightText(1250)).toBe("1,25 кг");
  });
  it("boxText: мм → см, неполная коробка — прочерк", () => {
    expect(boxText(200, 150, 100)).toBe("20×15×10 см");
    expect(boxText(200, null, 100)).toBe("—");
  });
  it("см ↔ мм", () => {
    expect(cmText(155)).toBe("15.5");
    expect(cmText(null)).toBe("");
    expect(toMm("15,5")).toBe(155);
    expect(toMm("")).toBeNull();
    expect(toMm("0.01")).toBe(1);
  });
  it("dayText: дата без времени не съезжает на день", () => {
    expect(dayText("2026-10-25")).toBe("25.10.2026");
  });
  it("maskTin", () => {
    expect(maskTin("1234567890")).toBe("•••••••890");
    expect(maskTin("12")).toBe("•••");
  });
});

describe("подписи НП", () => {
  it("незнакомая стадия — как есть и нейтрально", () => {
    expect(stageLabel("ARRIVED")).toBe("В отделении");
    expect(stageLabel("NEW_ONE")).toBe("NEW_ONE");
    expect(stageLabel(null)).toBe("—");
    expect(stageTone("NEW_ONE")).toBe("neutral");
    expect(stageTone("REFUSED")).toBe("danger");
  });
  it("serviceLabel знает оба написания", () => {
    expect(serviceLabel("POSTOMAT")).toBe("В почтомат");
    expect(serviceLabel("WarehouseDoors")).toBe("Курьером");
    expect(serviceLabel(null)).toBeNull();
  });
  it("править можно только свою ТТН до сканирования", () => {
    expect(shipmentEditable({ origin: "API", stage: "CREATED" })).toBe(true);
    expect(shipmentEditable({ origin: "API", stage: "NOT_FOUND" })).toBe(true);
    expect(shipmentEditable({ origin: "API", stage: "IN_TRANSIT" })).toBe(false);
    expect(shipmentEditable({ origin: "MANUAL", stage: "CREATED" })).toBe(false);
    expect(shipmentEditable(null)).toBe(false);
  });
});
