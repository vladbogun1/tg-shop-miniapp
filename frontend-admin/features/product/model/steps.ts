/** Шаги мастера «Редактировать товар»; `hint` — одна строка под заголовком: что делают на шаге. */
export const STEPS = [
  { key: "basics", label: "Основное", hint: "название и описание" },
  { key: "photos", label: "Фото", hint: "снимки и их порядок" },
  { key: "pricing", label: "Цена и склад", hint: "цена, сколько штук и почём закупили" },
  { key: "category", label: "Категория", hint: "куда положить и бренд" },
  { key: "specs", label: "Характеристики", hint: "для фильтров и сравнения" },
  { key: "site", label: "Сайт", hint: "SEO и показ на витрине" },
  { key: "review", label: "Проверка", hint: "всё ли готово к витрине" },
] as const;

export type ProductStepKey = (typeof STEPS)[number]["key"];

/** Номера шагов по ключу. */
export const S = { basics: 0, photos: 1, pricing: 2, category: 3, specs: 4, site: 5, review: 6 } as const;

/** Шаги, на которые может открыть мастер ссылка «/products?edit=<id>&step=specs». */
export const STEP_KEYS: ReadonlySet<string> = new Set<string>(STEPS.map((s) => s.key));
