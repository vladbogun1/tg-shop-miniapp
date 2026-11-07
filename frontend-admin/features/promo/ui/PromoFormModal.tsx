"use client";

import { Button } from "@shop/ui/admin-button";
import { useForm } from "@shop/ui/form";
import { Modal } from "@shop/ui/overlay";
import { toast } from "@shop/ui/toast";
import { AlertTriangle, Dices, Percent, Ticket, Wallet } from "lucide-react";
import { useEffect } from "react";
import { Input } from "@/components/ui/Input";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Toggle } from "@/components/ui/Toggle";
import { cn } from "@/lib/cn";
import { money } from "@/lib/money";
import {
  EMPTY_PROMO_FORM,
  PROMO_PRESETS,
  applyPreset,
  editWarning,
  exampleOf,
  expiryDay,
  firstError,
  initialForm,
  promoBody,
  promoErrors,
  randomCode,
  type Mode,
  type PromoFormValues,
} from "../model/form";
import type { PromoCode } from "../model/types";
import { useSavePromo } from "../queries";
import { ExpiryField } from "./ExpiryField";

interface Props {
  open: boolean;
  editing: PromoCode | null;
  onClose: () => void;
  /** Код создан (не правка) — экран переключается на «Наши». */
  onSaved: (created: boolean) => void;
}

function UsedWarning({ uses, renamed }: { uses: number; renamed: boolean }) {
  return (
    <div className="flex items-start gap-2 rounded-[var(--r-md)] border border-[color-mix(in_srgb,var(--warn)_40%,transparent)] bg-[color-mix(in_srgb,var(--warn)_10%,transparent)] p-2.5 text-[13px] leading-snug text-[var(--text)]">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--warn)]" />
      <span>
        Код уже применили {uses} раз. Скидка в этих заказах не изменится — правка коснётся только
        новых заказов.
        {renamed && " После переименования старые заказы останутся со старым кодом, а клиенты, которым вы его дали, получат «код не найден»."}
      </span>
    </div>
  );
}

/** Окно «Новый промокод» / «Редактировать промокод»; значения подставляются при каждом открытии. */
export function PromoFormModal({ open, editing, onClose, onSaved }: Props) {
  const form = useForm<PromoFormValues>({ defaultValues: EMPTY_PROMO_FORM });
  const v = form.watch() as PromoFormValues;
  const set = <K extends keyof PromoFormValues>(k: K, val: PromoFormValues[K]) => form.setValue(k, val as never);
  const saveM = useSavePromo((created) => {
    onSaved(created);
    onClose();
  });

  useEffect(() => {
    if (open) form.reset(initialForm(editing));
  }, [open, editing, form]);

  const initialDay = expiryDay(editing);
  const errors = promoErrors(v, initialDay);
  const { uses, renamed } = editWarning(editing, v.code);
  const example = exampleOf(v, errors);

  function save() {
    if (!v.code.trim()) return toast.error("Укажите код");
    const err = firstError(errors);
    if (err) return toast.error(err);
    saveM.mutate({ id: editing?.id ?? null, body: promoBody(v, initialDay) });
  }

  return (
    <Modal
      dirty={form.formState.isDirty}
      open={open}
      onClose={onClose}
      closeOnBackdrop={false}
      title={editing ? "Редактировать промокод" : "Новый промокод"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button variant="accent" loading={saveM.isPending} onClick={save}>
            Сохранить
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {uses > 0 && <UsedWarning uses={uses} renamed={renamed} />}
        <Input
          label="Код"
          value={v.code}
          onChange={(e) => set("code", e.target.value.toUpperCase())}
          placeholder="SUMMER25"
          className="font-mono tracking-wide"
          icon={<Ticket className="h-4 w-4" />}
        />
        {!editing && (
          <Button
            variant="ghost"
            size="sm"
            className="-mt-2 self-start"
            icon={<Dices className="h-4 w-4" />}
            onClick={() => set("code", randomCode())}
          >
            Сгенерировать код
          </Button>
        )}
        <div className="flex flex-col gap-2">
          <span className="field-label">Быстрый выбор</span>
          <div className="flex flex-wrap gap-2">
            {PROMO_PRESETS.map((p) => {
              const on = p.mode === v.mode && (p.mode === "percent" ? v.percent === p.value : v.amountMajor === p.value);
              return (
                <button
                  key={p.label}
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    const next = applyPreset(v, p);
                    set("mode", next.mode);
                    set("percent", next.percent);
                    set("amountMajor", next.amountMajor);
                  }}
                  className={cn(
                    "focusable hit min-h-[36px] rounded-full border px-3.5 text-[13px] font-semibold pointer-coarse:min-h-[44px]",
                    on
                      ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-hi)]"
                      : "border-[var(--line)] bg-[var(--surface-2)] text-[var(--text-muted)] hover:text-[var(--text)]"
                  )}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <span className="field-label">
            Тип скидки
          </span>
          <SegmentedControl<Mode>
            value={v.mode}
            onChange={(m) => set("mode", m)}
            options={[
              { value: "percent", label: "% от суммы" },
              { value: "amount", label: "₴ фиксированная" },
            ]}
          />
        </div>
        {v.mode === "percent" ? (
          <Input
            label="Скидка, %"
            inputMode="numeric"
            value={v.percent}
            error={v.percent.trim() ? (errors.percent ?? undefined) : undefined}
            onChange={(e) => set("percent", e.target.value.replace(/[^\d]/g, ""))}
            icon={<Percent className="h-4 w-4" />}
          />
        ) : (
          <Input
            label="Скидка, ₴"
            inputMode="decimal"
            value={v.amountMajor}
            error={v.amountMajor.trim() ? (errors.amount ?? undefined) : undefined}
            onChange={(e) => set("amountMajor", e.target.value)}
            icon={<Wallet className="h-4 w-4" />}
          />
        )}
        {v.mode === "percent" && (
          <Input
            label="Не больше, ₴"
            hint="Потолок скидки: 5 % от 10 000 ₴ при потолке 100 ₴ — это −100 ₴. Пусто = без потолка."
            inputMode="decimal"
            value={v.capMajor}
            error={errors.cap ?? undefined}
            onChange={(e) => set("capMajor", e.target.value)}
            icon={<Wallet className="h-4 w-4" />}
          />
        )}
        <Input
          label="Макс. использований"
          hint="Пусто = без лимита. Покупатель с кодом в корзине держит слот 30 минут."
          inputMode="numeric"
          value={v.maxUses}
          error={errors.maxUses ?? undefined}
          onChange={(e) => set("maxUses", e.target.value.replace(/[^\d]/g, ""))}
        />
        <ExpiryField value={v.expiresOn} error={errors.expiresOn ?? undefined} onChange={(d) => set("expiresOn", d)} />
        {example && (
          <p className="tabular rounded-[var(--r-md)] bg-[var(--surface-3)] px-3 py-2 text-[13px] text-[var(--text-muted)]">
            Пример: заказ на {money(example.base)} → скидка <b className="text-[var(--ok)]">−{money(example.discountMinor)}</b>
          </p>
        )}
        <div className="card-2 rounded-[var(--r-md)] px-3.5 py-3">
          <Toggle checked={v.active} onChange={(on) => set("active", on)} label="Активен" />
        </div>
      </div>
    </Modal>
  );
}
