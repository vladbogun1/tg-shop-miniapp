import { describe, expect, it } from "vitest";
import { addBranch, defaultBranchRef, presetText, removeBranch } from "./sender";
import type { SenderConfig } from "./types";

const cfg: SenderConfig = {
  counterpartyRef: "c",
  counterpartyName: "ФОП",
  contactRef: "p",
  phone: "380000000000",
  contacts: [],
  warehouses: [],
  defaultWarehouseRef: null,
};
const b65 = { ref: "65", number: "65", description: "Відділення №65", cityRef: "x", cityName: "Харків" };
const b104 = { ...b65, ref: "104", number: "104", description: "Відділення №104" };

describe("отделения отправителя", () => {
  it("первое добавленное — по умолчанию, повтор не добавляется", () => {
    const a = addBranch(addBranch(addBranch(cfg, b65), b104), b65);
    expect(a.warehouses.map((w) => w.ref)).toEqual(["65", "104"]);
    expect(a.defaultWarehouseRef).toBe("65");
  });
  it("убрали «по умолчанию» — им становится оставшееся", () => {
    const a = removeBranch(addBranch(addBranch(cfg, b65), b104), "65");
    expect(a.defaultWarehouseRef).toBe("104");
    expect(defaultBranchRef({ warehouses: a.warehouses, defaultWarehouseRef: null })).toBe("104");
  });
});

describe("presetText", () => {
  it("размеры в см, тара и цена", () => {
    expect(presetText({ name: "Мала", lengthMm: 200, widthMm: 150, heightMm: 100, tareG: 120, packMinor: 1500 })).toMatch(
      /^Мала: 20×15×10 \/ тара 120 г \/ 15/,
    );
  });
  it("без тары и цены — только размеры", () => {
    expect(presetText({ name: "Пакет", lengthMm: 300, widthMm: 200, heightMm: 15 })).toBe("Пакет: 30×20×1.5");
  });
});
