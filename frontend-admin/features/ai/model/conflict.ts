/**
 * Конфликт правок: пока работал ИИ, карточку мог изменить другой админ. Снимок полей на старте хранит сервер
 * (V92), он же отдаёт, какие поля изменились после старта (было → стало) и кто правил предмет по журналу действий.
 * Здесь — только текст блокировки поля. Чистая логика.
 *
 * Журнал знает, кто сохранял карточку, но не какое поле он тронул: имя — на уровне карточки. Один человек —
 * «Иван изменил «Вес» в 14:20»; несколько — «Карточку правили Иван, Анна (последняя правка в 14:20)».
 */
import { dayKey, formatShortDateTime, formatTime, now } from "@shop/core/time";

/** Изменение поля после старта, значения уже в виде для показа; `before: undefined` — прежнее значение не назвать. */
export interface FieldChangeView {
  before: string | null | undefined;
  after: string | null;
}

/** Кто правил предмет после старта, новые сверху (ISO-время из журнала). */
export interface EditorView {
  name: string;
  at: string;
}

export interface ConflictInput {
  /** Поле изменили после старта; null — не меняли. */
  change: FieldChangeView | null;
  editors: readonly EditorView[];
}

const dash = (v: string | null | undefined) => (v === null || v === undefined || v === "" ? "пусто" : v);

/** «в 14:20» сегодня, «07 нояб., 14:20» в другой день — время зрителя, как везде в админке. */
export function editTime(iso: string, at: Date = now()): string {
  return dayKey(iso) === dayKey(at.toISOString()) ? `в ${formatTime(iso)}` : formatShortDateTime(iso);
}

/** «Иван изменил «Вес» в 14:20» / «Карточку правили Иван, Анна (последняя правка в 14:20)» / «Изменено после запуска ИИ». */
export function whoChanged(label: string, editors: readonly EditorView[], at: Date = now()): string {
  if (editors.length === 0) return "Изменено после запуска ИИ";
  const when = editTime(editors[0].at, at);
  if (editors.length === 1) return `${editors[0].name} изменил «${label}» ${when}`;
  const last = when.startsWith("в ") ? when.slice(2) : when;
  return `Карточку правили ${editors.map((e) => e.name).join(", ")} (последняя правка ${last})`;
}

/** Текст блокировки поля по данным сервера или null, если поле после старта не меняли. */
export function conflictText(label: string, proposed: string, input: ConflictInput, at: Date = now()): string | null {
  const c = input.change;
  if (!c) return null;
  const was = c.before === undefined ? "" : `было ${dash(c.before)} → `;
  return `${whoChanged(label, input.editors, at)}: ${was}стало ${dash(c.after)} → ИИ предлагал ${proposed}`;
}

/**
 * Старая задача без снимка на сервере: известно лишь, что отпечаток карточки другой. Блокируются только замены
 * (значение могли исправить), пустое поле заполнить безопасно.
 */
export function conflictWithoutSnapshot(nowValue: string | null, versionChanged: boolean): string | null {
  if (!versionChanged || nowValue === null) return null;
  return "Карточку изменили после запуска ИИ: значение могли исправить, замена выключена";
}

/** Плашка над ревью: «Пока работал ИИ, карточку правил Иван · 2 из 7 полей изменены — их ИИ не заменит». */
export function editedBanner(editors: readonly EditorView[], conflicted: number, total: number): string {
  const who = editors.length === 0 ? "" : `, карточку ${editors.length === 1 ? "правил" : "правили"} ${editors.map((e) => e.name).join(", ")}`;
  if (conflicted === 0) return `Пока работал ИИ${who}, но предложенных полей это не коснулось`;
  return `Пока работал ИИ${who} · ${conflicted} из ${total} ${fieldsWord(total)} ${conflicted === 1 ? "изменено" : "изменены"} — их ИИ не заменит`;
}

function fieldsWord(n: number): string {
  const d = n % 10;
  const dd = n % 100;
  if (d === 1 && dd !== 11) return "поля";
  return "полей";
}

/** Изменено не меньше половины предложенного — наверху баннер «Повторить на актуальной карточке». */
export function mostlyConflicted(conflicted: number, proposed: number): boolean {
  return proposed > 0 && conflicted * 2 >= proposed;
}
