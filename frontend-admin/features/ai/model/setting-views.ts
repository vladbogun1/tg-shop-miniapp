import { uahFromCents } from "./format";
import { AI_KEYS } from "./setting-keys";

/**
 * Как показывать числовую настройку не в тех единицах, в которых она хранится. Экран «Настроек» хранит правку как
 * строку в единицах сервера (`raw`), поле показывает `toView(raw)`, ввод пересчитывает `fromView(text)`. Сейчас это
 * лимиты ИИ: на сервере центы, на экране доллары и гривны рядом (макет 07-settings).
 */
export interface SettingView {
  unit: string;
  toView(raw: string): string;
  /** Нераспознанный ввод возвращается как есть: проверка экрана «Настроек» не даст его сохранить. */
  fromView(text: string): string;
  /** Текст ошибки ввода на языке поля (null — всё хорошо); границы — в единицах поля. */
  check(text: string): string | null;
  /** Подсказка под полем по сохраняемому значению, например «≈ 420 ₴». */
  note(raw: string): string | null;
}

const CENTS = 100;
const MONEY = /^\d+(?:[.,]\d{0,2})?$/;
/** Потолок лимита на сервере — 10 000 000 центов. */
const MAX_CENTS = 10_000_000;

function cleanMoney(text: string): string {
  return text.trim().replace(/\s+/g, "").replace(/^\$|\$$/g, "");
}

/** Центы → «10», «2,5», «0,05» (без разрядов: это поле ввода). */
export function dollarsText(raw: string): string {
  if (!/^\d+$/.test(raw.trim())) return raw;
  const cents = Number(raw.trim());
  const whole = Math.floor(cents / CENTS);
  const rest = cents % CENTS;
  if (rest === 0) return String(whole);
  return `${whole},${String(rest).padStart(2, "0").replace(/0$/, "")}`;
}

export function centsFromDollars(text: string): string {
  const t = cleanMoney(text);
  if (t === "") return "";
  if (!MONEY.test(t)) return text;
  const [whole, frac = ""] = t.replace(",", ".").split(".");
  return String(Number(whole) * CENTS + Number(frac.padEnd(2, "0")));
}

/** Лимит в долларах; `rateKopecks` — курс для подсказки в гривнах (null — подсказки нет). */
export function dollarLimitView(rateKopecks: number | null): SettingView {
  return {
    unit: "$",
    toView: dollarsText,
    fromView: centsFromDollars,
    check: (text) => {
      const t = cleanMoney(text);
      if (t === "") return "Укажите сумму: 0 — без лимита";
      if (!MONEY.test(t)) return "Сумма в долларах, например 10 или 2,50";
      return Number(centsFromDollars(t)) > MAX_CENTS ? `Не больше ${MAX_CENTS / CENTS} $` : null;
    },
    note: (raw) => {
      if (!/^\d+$/.test(raw.trim())) return null;
      const cents = Number(raw.trim());
      if (cents === 0) return "без лимита";
      return rateKopecks ? `≈ ${uahFromCents(cents, rateKopecks)}` : null;
    },
  };
}

/** Поля «ИИ», которые показываются не в единицах хранения; `rateMilli` — курс из состояния ИИ (42 000 = 42 ₴). */
export function aiSettingViews(rateMilli: number | null | undefined): Record<string, SettingView> {
  const view = dollarLimitView(rateMilli ? Math.round(rateMilli / 10) : null);
  return { [AI_KEYS.monthLimit]: view, [AI_KEYS.dayLimit]: view };
}
