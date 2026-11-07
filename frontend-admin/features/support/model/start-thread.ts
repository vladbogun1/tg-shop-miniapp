import type { StartThreadBody } from "./types";

/** Форма «Написать клиенту» → тело запроса; null, пока id не число или текст пуст. */
export function parseStartThread(userId: string, subject: string, text: string): StartThreadBody | null {
  const id = Number(userId.trim());
  const message = text.trim();
  if (!Number.isSafeInteger(id) || id === 0 || !message) return null;
  const topic = subject.trim();
  return { userId: id, subject: topic || undefined, text: message };
}

/** Подсказка об ошибке в ручном Telegram id; null — поле пустое или id годится. */
export function manualIdProblem(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  const id = Number(v);
  return Number.isSafeInteger(id) && id !== 0 ? null : "Telegram id — целое число без пробелов и @";
}

/** Открытый вопрос этого клиента из загруженного списка (проверка дубля без запроса к бэкенду). */
export function openThreadOf<T extends { userId?: number | null; status: string }>(threads: T[], userId: number | null): T | undefined {
  if (userId == null) return undefined;
  return threads.find((t) => t.userId === userId && t.status === "OPEN");
}
