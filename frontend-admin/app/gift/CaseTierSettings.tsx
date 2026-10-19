"use client";

/**
 * «Настройки кейса» of one tier: threshold, guaranteed discount instead of the case (and its cap), the
 * swap of a similar prize, the validity of a promo code won from the case. Each field is saved at once
 * (PATCH /api/admin/gift/tiers/{tier}) — they are not part of the prizes' draft.
 */
import { useEffect, useState } from "react";
import { CASE_TIER_METAL } from "@shop/shared";
import { CASE_TIER_LABEL, type GiftTierAdmin, type GiftTierPatch } from "@/lib/gift";
import { cn } from "@/lib/cn";
import { money } from "@/lib/money";
import { Modal } from "@/components/ui/Modal";

/** Quick choices of the promo validity, days. */
const PROMO_DAYS = [7, 14, 30, 60, 90] as const;

export function CaseTierSettingsModal({
  open,
  onClose,
  t,
  busy,
  onPatch,
  reminderDays,
}: {
  open: boolean;
  onClose: () => void;
  t: GiftTierAdmin;
  busy: boolean;
  onPatch: (body: GiftTierPatch, ok: string) => void;
  /** gift.promoReminderDays: how many days before the end the customer is reminded (0 = off). */
  reminderDays: number | null;
}) {
  const exampleTotal = t.thresholdUah * 100;
  const gd = t.guaranteedPercent > 0 ? Math.floor((exampleTotal * t.guaranteedPercent) / 100 / 100) * 100 : 0;
  const guaranteed = t.guaranteedMaxUah > 0 ? Math.min(gd, t.guaranteedMaxUah * 100) : gd;
  const days = t.promoValidDays ?? 30;
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title={
        <span>
          Настройки · <span style={{ color: CASE_TIER_METAL[t.tier].ga }}>{CASE_TIER_LABEL[t.tier].toLowerCase()} кейс</span>
        </span>
      }
    >
      <p className="text-[12.5px] leading-snug text-[var(--text-muted)]">Каждое поле сохраняется сразу, без «Опубликовать».</p>
      <div className="mt-3 grid min-w-0 grid-cols-1 gap-3 min-[420px]:grid-cols-2">
        <IntField
          label="Порог суммы заказа"
          unit="₴"
          value={t.thresholdUah}
          min={1}
          max={1_000_000}
          disabled={busy}
          onCommit={(v) => onPatch({ thresholdUah: v }, `Порог: ${money(v * 100)}`)}
        />
        <IntField
          label="Замена похожего приза"
          unit="%"
          value={t.swapPercent}
          min={0}
          max={100}
          disabled={busy}
          hint="Промокод на этот % цены приза, если похожий товар уже куплен. 0 — без замены"
          onCommit={(v) => onPatch({ swapPercent: v }, v ? `Замена: ${v} % цены приза` : "Замена выключена")}
        />
        <IntField
          label="Гарантированная скидка вместо кейса"
          unit="%"
          value={t.guaranteedPercent}
          min={0}
          max={50}
          disabled={busy}
          hint="Покупатель при оформлении выбирает: эта скидка сразу или кейс. 0 — выбора нет, всегда кейс"
          onCommit={(v) => onPatch({ guaranteedPercent: v }, v ? `Гарантированная скидка: ${v} %` : "Гарантированная скидка выключена")}
        />
        <IntField
          label="Потолок гарантированной скидки"
          unit="₴"
          value={t.guaranteedMaxUah}
          min={0}
          max={100_000}
          disabled={busy || t.guaranteedPercent === 0}
          hint="0 — без потолка"
          onCommit={(v) => onPatch({ guaranteedMaxUah: v }, v ? `Потолок: ${money(v * 100)}` : "Потолок снят")}
        />
      </div>
      {t.guaranteedPercent > 0 && (
        <p className="mt-2 text-[12px] leading-snug text-[var(--text-muted)]">
          Пример: заказ на {money(exampleTotal)} — скидка <b className="tabular text-[var(--text)]">−{money(guaranteed)}</b>
          {t.guaranteedMaxUah > 0 ? ` (не больше ${money(t.guaranteedMaxUah * 100)})` : ""}.
        </p>
      )}

      {t.lowMarginProductPercent != null && (
        <div className="mt-4 min-w-0 border-t border-[var(--line)] pt-3">
          <div className="max-w-[260px]">
            <IntField
              label="Доля товарных призов при упоре на скидки"
              unit="%"
              value={t.lowMarginProductPercent}
              min={0}
              max={100}
              disabled={busy}
              onCommit={(v) =>
                onPatch({ lowMarginProductPercent: v }, v === 100 ? "Упор на скидки выключен для уровня" : `Товарные призы: ${v} % при упоре на скидки`)
              }
            />
          </div>
          <p className="mt-1 text-[12px] leading-snug text-[var(--text-muted)]">
            Если в заказе товар из «Упор на скидки»: товарные призы вместе выпадают с этой вероятностью, остальное — призы-скидки.
            Соотношения внутри групп не меняются. 100 — как обычно, 0 — только скидки.
          </p>
        </div>
      )}

      {t.promoValidDays != null && (
        <div className="mt-4 min-w-0 border-t border-[var(--line)] pt-3">
          <div className="field-label">Срок промокода из кейса</div>
          <p className="mt-0.5 text-[12px] leading-snug text-[var(--text-faint)]">
            Для призов-скидок и замены приза. Уже выданные коды не меняются.
          </p>
          <div className="mt-2 flex min-w-0 flex-wrap items-center gap-1.5">
            {PROMO_DAYS.map((d) => (
              <button
                key={d}
                type="button"
                disabled={busy}
                onClick={() => d !== days && onPatch({ promoValidDays: d }, `Промокод действует ${d} дн.`)}
                className={cn(
                  "focusable tabular h-9 rounded-[var(--r-sm)] border px-3 text-[13px] font-semibold transition-colors pointer-coarse:h-10",
                  d === days
                    ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] text-[var(--ink)]"
                    : "border-[var(--line)] bg-[var(--surface-2)] text-[var(--text-muted)] hover:text-[var(--text)]"
                )}
              >
                {d} дн.
              </button>
            ))}
            <div className="w-[120px]">
              <IntField
                label=""
                unit="дн."
                value={days}
                min={1}
                max={365}
                disabled={busy}
                onCommit={(v) => onPatch({ promoValidDays: v }, `Промокод действует ${v} дн.`)}
              />
            </div>
          </div>
          <p className="mt-2 text-[12px] leading-snug text-[var(--text-muted)]">
            {reminderDays == null
              ? null
              : reminderDays > 0
                ? `Напоминание в бот — за ${reminderDays} дн. до конца срока, если код ещё не использован (настройка «Напомнить о промокоде» выше).`
                : "Напоминание о сроке выключено (настройка «Напомнить о промокоде» выше)."}
          </p>
        </div>
      )}
    </Modal>
  );
}

/** A whole-number field committed on blur / Enter; Esc reverts. */
export function IntField({
  label,
  unit,
  value,
  min,
  max,
  disabled,
  hint,
  onCommit,
}: {
  label: string;
  unit: string;
  value: number;
  min: number;
  max: number;
  disabled?: boolean;
  hint?: string;
  onCommit: (v: number) => void;
}) {
  const [raw, setRaw] = useState(String(value));
  useEffect(() => setRaw(String(value)), [value]);
  const n = raw.trim() === "" ? NaN : Number(raw);
  const bad = !Number.isInteger(n) || n < min || n > max;
  const commit = () => {
    if (bad) {
      setRaw(String(value));
      return;
    }
    if (n !== value) onCommit(n);
  };
  return (
    <label className="flex min-w-0 flex-col gap-1">
      {label && <span className="field-label">{label}</span>}
      <span
        className={cn(
          "flex h-10 min-w-0 items-center rounded-[var(--r-md)] border bg-[var(--surface-2)] pr-2.5 pointer-coarse:h-11",
          bad ? "border-[var(--danger)]" : "border-[var(--line)]"
        )}
      >
        <input
          inputMode="numeric"
          aria-label={label || unit}
          value={raw}
          disabled={disabled}
          aria-invalid={bad || undefined}
          onChange={(e) => setRaw(e.target.value.replace(/\D/g, "").slice(0, 7))}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") setRaw(String(value));
          }}
          className="tabular focusable h-full min-w-0 flex-1 bg-transparent px-2.5 text-[14px] text-[var(--text)] outline-none"
        />
        <span className="shrink-0 font-display text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-faint)]">{unit}</span>
      </span>
      {hint && <span className="text-[11.5px] leading-snug text-[var(--text-faint)]">{hint}</span>}
    </label>
  );
}
