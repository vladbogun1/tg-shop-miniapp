import type { AiSummary } from "../api";

export interface ChipView {
  label: string;
  /** Число «ждут проверки» рядом со значком; 0 — без числа. */
  waiting: number;
  running: boolean;
  problem: boolean;
}

/** Что показать в чипе ✦: `null` — ничего (ИИ не подключён или нечего сказать). */
export function chipView(s: AiSummary | undefined): ChipView | null {
  if (!s || !s.configured) return null;
  if (s.running === 0 && s.review === 0 && s.problems === 0) return null;
  const label =
    s.running > 0
      ? `ИИ работает: задач ${s.running}`
      : s.review > 0
        ? `Ждут проверки результатов ИИ: ${s.review}`
        : `Сбоев ИИ за сутки: ${s.problems}`;
  return { label, waiting: s.review, running: s.running > 0, problem: s.problems > 0 };
}
