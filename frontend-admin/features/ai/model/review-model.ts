/**
 * Ревью результата ИИ: поля «было → стало», группы, замок, выбор и ОДНО число «N из M». Чистая логика без React;
 * фича-владелец (карточки) переводит свой разбор ответа в `ReviewField[]`, а применение берёт себе.
 *
 * Формула счётчика одна: M — поля, которые можно применить (группы «Проверьте» без красного, «Заполнит пустое»,
 * «Заменит значение»; замок и красное не входят), N — из них включённые. Число в шапке и в кнопке — `counts()`.
 */
export type Suspicion = "none" | "warn" | "bad";
export type GroupId = "check" | "fill" | "replace" | "locked";

export interface ReviewField {
  key: string;
  label: string;
  /** Что в карточке сейчас; null — пусто. */
  before: string | null;
  after: string;
  /** Уверенность модели 0…100: цвет точки, число не показываем. */
  confidence: number | null;
  /** Адрес источника, если модель его назвала. */
  source: string | null;
  /** Почему сомнительно, простыми словами. */
  reason: string | null;
  suspicion: Suspicion;
  /** Заполнено не ИИ: значение есть и его вписал человек (или метки автора нет). */
  humanLocked: boolean;
  lockNote: string | null;
  /** Карточку изменили, пока работал ИИ: поле заблокировано, текст — что именно изменилось. */
  conflict: string | null;
}

export const GROUP_ORDER: readonly GroupId[] = ["check", "fill", "replace", "locked"];

export const GROUP_TITLE: Record<GroupId, string> = {
  check: "Проверьте",
  fill: "Заполнит пустое",
  replace: "Заменит значение",
  locked: "Заполнено не ИИ",
};

export function groupOf(f: ReviewField): GroupId {
  if (f.humanLocked || f.conflict) return "locked";
  if (f.suspicion !== "none") return "check";
  return f.before === null ? "fill" : "replace";
}

/** Поле можно включить: не замок и не красное. */
export function applicable(f: ReviewField): boolean {
  return groupOf(f) !== "locked" && f.suspicion !== "bad";
}

export function buildGroups(fields: ReviewField[]): { id: GroupId; fields: ReviewField[] }[] {
  return GROUP_ORDER.map((id) => ({ id, fields: fields.filter((f) => groupOf(f) === id) })).filter((g) => g.fields.length > 0);
}

/** Что включено сразу: только «Заполнит пустое». Сомнительное и замены человек включает сам. */
export function initialSelection(fields: ReviewField[]): Set<string> {
  return new Set(fields.filter((f) => groupOf(f) === "fill").map((f) => f.key));
}

export function toggled(selected: ReadonlySet<string>, field: ReviewField): Set<string> {
  const next = new Set(selected);
  if (!applicable(field)) return next;
  if (next.has(field.key)) next.delete(field.key);
  else next.add(field.key);
  return next;
}

/** Выбранное, что действительно применится (замок и красное отсеяны, даже если ключ остался в наборе). */
export function chosen(fields: ReviewField[], selected: ReadonlySet<string>): ReviewField[] {
  return fields.filter((f) => applicable(f) && selected.has(f.key));
}

export interface Counts {
  /** Включено. */
  n: number;
  /** Можно применить. */
  m: number;
  /** Под замком (не ИИ или конфликт правок). */
  locked: number;
}

export function counts(fields: ReviewField[], selected: ReadonlySet<string>): Counts {
  const m = fields.filter(applicable).length;
  return { n: chosen(fields, selected).length, m, locked: fields.filter((f) => groupOf(f) === "locked").length };
}

/** Включено в каждой группе; сумма по группам всегда равна `counts().n`. */
export function selectedByGroup(fields: ReviewField[], selected: ReadonlySet<string>): Record<GroupId, number> {
  const out: Record<GroupId, number> = { check: 0, fill: 0, replace: 0, locked: 0 };
  for (const f of chosen(fields, selected)) out[groupOf(f)] += 1;
  return out;
}

/** Группа «Проверьте» открыта, если в ней до пяти полей; иначе свёрнута (с красной точкой). */
export const CHECK_OPEN_MAX = 5;

export function groupOpenByDefault(id: GroupId, size: number): boolean {
  if (id === "fill") return true;
  if (id === "check") return size <= CHECK_OPEN_MAX;
  return false;
}

/** Результат старше двух недель мог устареть: товар и рынок изменились. */
export const STALE_DAYS = 14;
const DAY_MS = 86_400_000;

export function isStale(finishedAt: string | null | undefined, nowMs: number): boolean {
  if (!finishedAt) return false;
  const t = Date.parse(finishedAt);
  return Number.isFinite(t) && nowMs - t > STALE_DAYS * DAY_MS;
}

/** Красное и жёлтое выше: сначала то, что нельзя применить. */
export function sortChecks(fields: ReviewField[]): ReviewField[] {
  const rank = (f: ReviewField) => (f.suspicion === "bad" ? 0 : 1);
  return [...fields].sort((a, b) => rank(a) - rank(b));
}

/** Что сообщить серверу после применения: сколько принято, отклонено и сколько осталось под замком. */
export function outcomeCounts(fields: ReviewField[], selected: ReadonlySet<string>, edited = 0) {
  const c = counts(fields, selected);
  return { applied: c.n, rejected: c.m - c.n, edited, ignoredLocked: c.locked };
}
