"use client";

import type { ReactNode } from "react";
import { LogoMark } from "@/components/brand/Logo";
import { Toggle } from "@/components/ui/Toggle";
import { ApiError } from "@shop/core/errors";

const TRUST_LABEL = "Доверять этому устройству 30 дней";

export function StepHeader({ icon, title, subtitle }: { icon: ReactNode; title: string; subtitle: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col items-center text-center">
      <LogoMark size={40} />
      <div className="mt-4 flex items-center gap-2.5">
        <span aria-hidden className="accent-tint grid h-8 w-8 place-items-center rounded-[var(--r-md)]">
          {icon}
        </span>
        <h1 className="font-display text-[15px] font-bold uppercase tracking-[0.14em] text-[var(--ink)]">{title}</h1>
      </div>
      <p className="mt-2 max-w-[34ch] text-[13.5px] leading-relaxed text-[var(--text-muted)]">{subtitle}</p>
    </div>
  );
}

export function StepLabel({ n, children }: { n: number; children: ReactNode }) {
  return (
    <h2 className="mb-2 flex items-center gap-2.5">
      <span className="font-display grid h-6 w-6 place-items-center rounded-full border border-[var(--accent)] text-[12px] font-bold text-[var(--accent-hi)]">
        {n}
      </span>
      <span className="font-display text-[13px] font-bold uppercase tracking-[0.08em] text-[var(--ink)]">{children}</span>
    </h2>
  );
}

export function TrustToggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2.5">
      <Toggle checked={checked} onChange={onChange} label={TRUST_LABEL} />
      <p className="mt-1.5 pl-14 text-[12px] leading-snug text-[var(--text-faint)]">
        Только на своём телефоне или компьютере. Код не будет спрашиваться до 30 дней; забыть устройство — в «Мой аккаунт».
      </p>
    </div>
  );
}

/** Отказ второго шага: неверный код остаётся на шаге, истёкший вход / блокировка — назад к паролю. */
export function handleSecondStepError(err: unknown, onWrongCode: (message: string) => void, onRestart: (message?: string) => void) {
  if (err instanceof ApiError && err.status === 401 && /неверный код/i.test(err.message)) {
    onWrongCode(err.message);
    return;
  }
  onRestart(err instanceof ApiError ? err.message : "Не удалось войти — попробуйте ещё раз");
}
