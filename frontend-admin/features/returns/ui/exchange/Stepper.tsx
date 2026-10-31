import type { ReactNode } from "react";

/** Счётчик «− N +» без подписей — для строк обмена. */
export function Stepper({
  value,
  min,
  max,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <StepBtn disabled={value <= min} onClick={() => onChange(value - 1)}>
        −
      </StepBtn>
      <span className="tabular w-6 text-center text-[14px] font-semibold text-[var(--text)]">{value}</span>
      <StepBtn disabled={value >= max} onClick={() => onChange(value + 1)}>
        +
      </StepBtn>
    </div>
  );
}

function StepBtn({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="nb-press grid h-8 w-8 place-items-center rounded-[var(--r-sm)] border border-[var(--border-2)] bg-[var(--surface-2)] text-[16px] font-semibold leading-none text-[var(--text)] transition-colors hover:border-[var(--line-strong)] hover:bg-[var(--surface-3)] disabled:opacity-40"
    >
      {children}
    </button>
  );
}
