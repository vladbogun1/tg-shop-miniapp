/**
 * Чистые валидаторы форм (docs/ARCHITECTURE-FRONT.md, 2.5 «Формы»): правило — функция «значение → код ошибки или
 * undefined». Текст по коду подставляет вызывающий (i18n покупателя / русский админки). Схема валидации бэкенда —
 * источник правды; здесь только быстрые проверки до отправки.
 */

export type Rule<V = string> = (value: V) => string | undefined;

/** Правила по полям формы. */
export type Rules<T> = { [K in keyof T]?: ReadonlyArray<Rule<T[K]>> };

export type FieldCodes<T> = { [K in keyof T]?: string };

function isBlank(v: unknown): boolean {
  return v === undefined || v === null || (typeof v === "string" && v.trim() === "") || (Array.isArray(v) && v.length === 0);
}

export const required =
  (code = "required"): Rule<unknown> =>
  (v) =>
    isBlank(v) ? code : undefined;

/** Пустое значение проходит: «обязательность» — отдельное правило `required`. */
export const minLength =
  (n: number, code = "tooShort"): Rule<string> =>
  (v) =>
    !isBlank(v) && v.trim().length < n ? code : undefined;

export const maxLength =
  (n: number, code = "tooLong"): Rule<string> =>
  (v) =>
    v.length > n ? code : undefined;

export const pattern =
  (re: RegExp, code = "invalid"): Rule<string> =>
  (v) =>
    !isBlank(v) && !re.test(v.trim()) ? code : undefined;

/** Без регулярки наверху модуля (docs/BROWSER-SUPPORT.md: ничего умного на верхнем уровне) — создаётся при вызове. */
export const email =
  (code = "invalidEmail"): Rule<string> =>
  (v) =>
    !isBlank(v) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) ? code : undefined;

export const min =
  (n: number, code = "tooSmall"): Rule<number> =>
  (v) =>
    Number.isFinite(v) && v < n ? code : undefined;

export const max =
  (n: number, code = "tooBig"): Rule<number> =>
  (v) =>
    Number.isFinite(v) && v > n ? code : undefined;

/** Первая сработавшая ошибка каждого поля; поля без ошибок в результат не попадают. */
export function validateAll<T extends object>(values: T, rules: Rules<T>): FieldCodes<T> {
  const out: FieldCodes<T> = {};
  for (const key of Object.keys(rules) as Array<keyof T>) {
    for (const rule of rules[key] ?? []) {
      const code = rule(values[key]);
      if (code) {
        out[key] = code;
        break;
      }
    }
  }
  return out;
}
