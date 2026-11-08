/**
 * Что за вещь в строке, по родовым словам накладной (китайским или английскому переводу ИИ) против родовых слов наших
 * русских названий: «mouse feet» / 脚贴 — это наши «Глайды», «anti-slip» / 防滑贴 — «Грипсы». Без этого у китайской
 * строки и русского названия общее только слово бренда. Тот же список, что SupplyKinds.java на сервере.
 */
import type { SourceLine } from "./types";

/** Слова накладной (подстроки строки в нижнем регистре) → основы слов наших названий. */
const KINDS: { invoice: string[]; stems: string[] }[] = [
  { invoice: ["mouse feet", "mouse skate", "skates", "glides", "脚贴", "鼠标脚", "脚垫"], stems: ["глайд"] },
  { invoice: ["grip tape", "grips", "anti-slip", "anti slip", "防滑贴"], stems: ["грипс"] },
  { invoice: ["mouse pad", "mousepad", "desk mat", "鼠标垫", "桌垫"], stems: ["коврик", "ковер", "стеклопад"] },
  { invoice: ["keycap", "键帽"], stems: ["кейкап", "кепки"] },
  { invoice: ["switches", "switch", "轴体"], stems: ["переключат", "свич"] },
  { invoice: ["keyboard", "键盘"], stems: ["клавиатур"] },
  { invoice: ["headset", "headphone", "earphone", "耳机"], stems: ["наушник"] },
  { invoice: ["cable", "数据线"], stems: ["кабел"] },
  { invoice: ["sleeve", "袖套"], stems: ["рукав"] },
  { invoice: ["gaming mouse", "wireless mouse", "游戏鼠标", "无线鼠标"], stems: ["мыш"] },
  { invoice: ["usb fan", "cooling fan", "portable fan", "风扇"], stems: ["дуйк", "вентилятор"] },
];

/** Строка называет вещь, с основы которой начинается одно из слов названия. */
export function sameKind(l: SourceLine, titleWords: string[]): boolean {
  const text = [l.text ?? "", l.en ?? "", l.variant ?? ""].join(" ").toLowerCase();
  return KINDS.some((k) => k.invoice.some((w) => text.includes(w)) && titleWords.some((t) => k.stems.some((s) => t.startsWith(s))));
}
