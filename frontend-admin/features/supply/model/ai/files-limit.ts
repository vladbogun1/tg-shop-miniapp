/**
 * Лимит картинок одной задачи чтения: что из выбранных/вставленных файлов взять, а что отсеять и почему.
 * Страница PDF — одна картинка, но число страниц знает только сервер: PDF считаем за одну, лишние страницы
 * сервер отклонит сам (AI_FILES_OVER с числами).
 */

/** Не больше стольки картинок за раз (страница PDF — одна картинка): столько читает одна задача. */
export const MAX_PICTURES = 10;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

export interface Admitted<F> {
  take: F[];
  /** Больше 10 МБ — сервер всё равно откажет. */
  tooBig: F[];
  /** Не влезли в лимит картинок. */
  overLimit: F[];
}

/** `taken` — картинки уже на сервере плюс файлы в очереди загрузки. */
export function admitFiles<F extends { name: string; size: number }>(picked: readonly F[], taken: number): Admitted<F> {
  const tooBig = picked.filter((f) => f.size > MAX_FILE_BYTES);
  const fit = picked.filter((f) => f.size <= MAX_FILE_BYTES);
  const room = Math.max(0, MAX_PICTURES - taken);
  return { take: fit.slice(0, room), tooBig, overLimit: fit.slice(room) };
}

/** Тексты отказа для тоста (пусто — всё взяли). */
export function admitMessages(a: Admitted<{ name: string }>, taken: number): string[] {
  const out: string[] = [];
  if (a.tooBig.length) out.push(`Больше 10 МБ, не загружаю: ${names(a.tooBig)}`);
  if (a.overLimit.length) {
    const left = Math.max(0, MAX_PICTURES - taken);
    out.push(
      left === 0
        ? `Уже ${MAX_PICTURES} из ${MAX_PICTURES} картинок — больше за раз не читается. Не добавлены: ${names(a.overLimit)}`
        : `За раз читается не больше ${MAX_PICTURES} картинок, место ещё для ${left}. Не добавлены: ${names(a.overLimit)}`,
    );
  }
  return out;
}

function names(list: readonly { name: string }[]): string {
  const shown = list.slice(0, 3).map((f) => f.name || "картинка").join(", ");
  return list.length > 3 ? `${shown} и ещё ${list.length - 3}` : shown;
}

/** Подпись счётчика: «3 из 10 картинок». */
export function picturesCounter(onServer: number, queued: number): string {
  return `${onServer + queued} из ${MAX_PICTURES} картинок`;
}

/** Доля отправленного → «45 %»; до первого события — «0 %». */
export function percent(sent: number): string {
  return `${Math.round(Math.min(1, Math.max(0, sent)) * 100)} %`;
}
