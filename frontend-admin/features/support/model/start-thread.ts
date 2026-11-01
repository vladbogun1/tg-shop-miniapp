import type { StartThreadBody } from "./types";

/** Форма «Написать клиенту» → тело запроса; null, пока id не число или текст пуст. */
export function parseStartThread(userId: string, subject: string, text: string): StartThreadBody | null {
  const id = Number(userId.trim());
  const message = text.trim();
  if (!Number.isSafeInteger(id) || id === 0 || !message) return null;
  const topic = subject.trim();
  return { userId: id, subject: topic || undefined, text: message };
}
