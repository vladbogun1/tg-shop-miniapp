/** Шаги мастера «Редактировать товар». */
export const STEPS = [
  { key: "basics", label: "Основное" },
  { key: "photos", label: "Фото" },
  { key: "pricing", label: "Цена и склад" },
  { key: "category", label: "Категория" },
  { key: "specs", label: "Характеристики" },
  { key: "site", label: "Сайт" },
  { key: "review", label: "Проверка" },
] as const;

export type ProductStepKey = (typeof STEPS)[number]["key"];

/** Номера шагов по ключу. */
export const S = { basics: 0, photos: 1, pricing: 2, category: 3, specs: 4, site: 5, review: 6 } as const;

/** Шаги, на которые может открыть мастер ссылка «/products?edit=<id>&step=specs». */
export const STEP_KEYS: ReadonlySet<string> = new Set<string>(STEPS.map((s) => s.key));
