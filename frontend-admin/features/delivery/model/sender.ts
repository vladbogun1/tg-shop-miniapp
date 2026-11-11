/** Правки отправителя без React: отделения отправки и «по умолчанию», подпись коробки. */
import { money } from "@shop/core/money";
import { cmText } from "./format";
import type { BoxPreset, NpBranch, SenderConfig } from "./types";

/** Отделение по умолчанию: заданное или первое в списке. */
export function defaultBranchRef(cfg: Pick<SenderConfig, "warehouses" | "defaultWarehouseRef">): string | null {
  return cfg.defaultWarehouseRef || cfg.warehouses[0]?.ref || null;
}

/** Добавить отделение (повтор не добавляется); первое добавленное становится «по умолчанию». */
export function addBranch(cfg: SenderConfig, b: Pick<NpBranch, "ref" | "number" | "description" | "cityRef" | "cityName">): SenderConfig {
  if (cfg.warehouses.some((w) => w.ref === b.ref)) return cfg;
  const w = { ref: b.ref, number: b.number, description: b.description, cityRef: b.cityRef, cityName: b.cityName };
  return { ...cfg, warehouses: [...cfg.warehouses, w], defaultWarehouseRef: cfg.defaultWarehouseRef || w.ref };
}

/** Убрать отделение; если оно было «по умолчанию» — им становится первое оставшееся. */
export function removeBranch(cfg: SenderConfig, ref: string): SenderConfig {
  const rest = cfg.warehouses.filter((w) => w.ref !== ref);
  const def = cfg.defaultWarehouseRef === ref ? (rest[0]?.ref ?? null) : cfg.defaultWarehouseRef;
  return { ...cfg, warehouses: rest, defaultWarehouseRef: def };
}

/** «Мала: 20×15×10 / тара 120 г / 15 ₴» — коробка, как её видно в окне ТТН. */
export function presetText(p: BoxPreset): string {
  const parts = [`${cmText(p.lengthMm)}×${cmText(p.widthMm)}×${cmText(p.heightMm)}`];
  if (p.tareG) parts.push(`тара ${p.tareG} г`);
  if (p.packMinor) parts.push(money(p.packMinor));
  return `${p.name}: ${parts.join(" / ")}`;
}
