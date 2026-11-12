import { describe, expect, it } from "vitest";
import { addBranch, defaultBranchRef, removeBranch } from "./sender";
import type { SenderConfig } from "./types";

const cfg: SenderConfig = {
  counterpartyRef: "c",
  counterpartyName: "ФОП",
  ownershipForm: "PrivatePerson",
  contactRef: "p",
  contactName: "Тест",
  phone: "380000000000",
  contacts: [],
  warehouses: [],
  defaultWarehouseRef: "",
  loadedAt: "",
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
    expect(defaultBranchRef({ warehouses: a.warehouses, defaultWarehouseRef: "" })).toBe("104");
  });
});

