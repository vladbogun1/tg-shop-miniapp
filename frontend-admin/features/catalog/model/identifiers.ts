/** Ключи характеристик и значения опций: латиница, snake_case. */
import { slugify } from "./slug";

/** snake_case latin key from a Russian label: «Вес» → ves, «Частота опроса» → chastota_oprosa. */
export function keyFromLabel(label: string): string {
  return slugify(label).replace(/-/g, "_").replace(/^(\d)/, "_$1").slice(0, 48);
}

export function isValidKey(key: string): boolean {
  return /^[a-z][a-z0-9_]{0,47}$/.test(key);
}

/** Option value slug: lower latin, digits, underscore. */
export function optionValueFrom(label: string): string {
  return slugify(label).replace(/-/g, "_").slice(0, 64);
}
