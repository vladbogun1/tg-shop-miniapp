/**
 * Конфликт правок: пока работал ИИ, карточку мог изменить другой админ. При старте запоминается версия карточки
 * (отпечаток) и — в этом браузере — значения полей; при открытии ревью изменённые после старта поля блокируются.
 * Чистая логика.
 */

export interface ConflictInput {
  /** Значения полей на момент старта (показанные строки); null — снимка нет (другой браузер, очищено). */
  start: Record<string, string | null> | null;
  /** Отпечаток карточки сейчас не совпадает с тем, что был при старте. */
  versionChanged: boolean;
}

const dash = (v: string | null | undefined) => (v === null || v === undefined || v === "" ? "пусто" : v);

/**
 * Текст блокировки поля или null. Со снимком — точное «было → стало → ИИ предлагал»; без снимка при изменённой
 * карточке блокируются только замены (значение, которое могли исправить): пустое поле заполнить безопасно.
 */
export function conflictText(
  key: string,
  nowValue: string | null,
  proposed: string,
  input: ConflictInput,
): string | null {
  if (!input.versionChanged) return null;
  if (input.start) {
    const was = input.start[key] ?? null;
    if (was === nowValue) return null;
    return `Изменено после запуска ИИ: было ${dash(was)} → стало ${dash(nowValue)} → ИИ предлагал ${proposed}`;
  }
  if (nowValue === null) return null;
  return "Карточку изменили после запуска ИИ: значение могли исправить, замена выключена";
}

/** Изменено не меньше половины предложенного — наверху баннер «Повторить на актуальной карточке». */
export function mostlyConflicted(conflicted: number, proposed: number): boolean {
  return proposed > 0 && conflicted * 2 >= proposed;
}
