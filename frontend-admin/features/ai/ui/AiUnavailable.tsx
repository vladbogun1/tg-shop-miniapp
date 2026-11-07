"use client";

import { Bot, KeyRound, Power } from "lucide-react";

type Reason = "not-configured" | "disabled" | "feature-off";

const TEXT: Record<Reason, { title: string; hint: string }> = {
  "not-configured": {
    title: "ИИ не подключён",
    hint: "На сервере не задан ключ модели. Добавьте его в .env и перезапустите бэкенд — в настройках ключей нет.",
  },
  disabled: {
    title: "ИИ выключен",
    hint: "Общий выключатель в настройках («Настройки» → «ИИ») выключен: новые задачи не стартуют.",
  },
  "feature-off": {
    title: "Эта функция ИИ выключена",
    hint: "Включить её может владелец в «Настройки» → «ИИ» → «Функции».",
  },
};

const ICON = { "not-configured": KeyRound, disabled: Power, "feature-off": Power } as const;

/**
 * Вместо кнопки ИИ, когда ею нельзя пользоваться: нет ключа, выключен общий выключатель или функция. Без денег и
 * имён настроек, которые обычный админ видеть не должен.
 */
export function AiUnavailable({ reason }: { reason: Reason }) {
  const { title, hint } = TEXT[reason];
  const Icon = ICON[reason] ?? Bot;
  return (
    <div role="status" className="flex min-w-0 items-start gap-3 rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] p-3">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[var(--r-sm)] bg-[var(--surface-3)] text-[var(--text-muted)]">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <div className="text-[13px] font-semibold text-[var(--ink)]">{title}</div>
        <p className="mt-0.5 text-[12px] leading-snug text-[var(--text-muted)]">{hint}</p>
      </div>
    </div>
  );
}
