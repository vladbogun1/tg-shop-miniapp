"use client";

/** «Подарок за сумму»: the switch, the threshold, what the buyer gets (one product / a case), the fallback gift product, the limits. */
import { Gift } from "lucide-react";
import { isDirty } from "@/features/settings";
import { Badge } from "@/components/ui/Badge";
import { PanelHeader } from "@/components/ui/PanelHeader";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { GIFT_SETTING } from "../model/settings-keys";
import { BoolRow, NumField, type FieldProps } from "./GiftFields";
import { GiftProductField } from "./GiftProductField";

type Change = (key: string, raw: string | boolean) => void;

export function GiftSection({
  enabled,
  threshold,
  caseMode,
  productId,
  productDirty,
  reminder,
  margin,
  monthlyLimit,
  onChange,
}: {
  enabled: FieldProps | null;
  threshold: FieldProps | null;
  /** `gift.caseEnabled`: null = an old backend without the case. */
  caseMode: FieldProps | null;
  productId: string;
  productDirty: boolean;
  /** gift.promoReminderDays / gift.marginPercent: null = an old backend. */
  reminder: FieldProps | null;
  margin: FieldProps | null;
  /** gift.monthlyLimitUah: null = an old backend. */
  monthlyLimit: FieldProps | null;
  onChange: Change;
}) {
  const on = !!enabled && Boolean(enabled.entry.raw);
  const isCase = !!caseMode && Boolean(caseMode.entry.raw);

  return (
    <section className="panel min-w-0 p-4 sm:p-5">
      <PanelHeader
        icon={Gift}
        title="Подарок за сумму"
        description={
          isCase
            ? "Кейс, который магазин сам кладёт в заказ от суммы (после скидки). Пороги — у каждого кейса ниже."
            : "Товар, который магазин сам кладёт в заказ от указанной суммы (после скидки)."
        }
      />
      <div className="flex min-w-0 flex-col gap-4">
        {enabled && <BoolRow {...enabled} label="Включено" onChange={(v) => onChange(GIFT_SETTING.giftEnabled, v)} />}
        {threshold && (
          <div className="max-w-[260px]">
            <NumField
              {...threshold}
              label={isCase ? "Порог запасного товара-подарка" : "Порог суммы заказа"}
              hideHint
              onChange={(v) => onChange(GIFT_SETTING.giftThreshold, v)}
            />
          </div>
        )}
        {caseMode && <CaseModeField field={caseMode} isCase={isCase} onChange={onChange} />}
        <GiftProductField
          productId={productId}
          dirty={productDirty}
          on={on}
          isCase={isCase}
          onPick={(id) => onChange(GIFT_SETTING.giftProduct, id)}
        />
        {isCase && <CaseNumbers reminder={reminder} margin={margin} onChange={onChange} />}
        {on && monthlyLimit && (
          <div className="border-t border-[var(--line)] pt-4">
            <NumField {...monthlyLimit} label="Лимит подарков на человека в месяц" onChange={(v) => onChange(GIFT_SETTING.monthlyLimit, v)} />
          </div>
        )}
      </div>
    </section>
  );
}

/** «Что получает покупатель»: one product or a case. */
function CaseModeField({ field, isCase, onChange }: { field: FieldProps; isCase: boolean; onChange: Change }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-2">
        <span className="field-label">Что получает покупатель</span>
        {isDirty(field.item, field.entry) && <Badge tone="accent">Не сохранено</Badge>}
      </div>
      <SegmentedControl
        value={isCase ? "case" : "one"}
        onChange={(v) => onChange(GIFT_SETTING.giftCase, v === "case")}
        options={[
          { value: "one", label: "Один товар" },
          { value: "case", label: "Кейс" },
        ]}
      />
      <p className="mt-1.5 text-[12.5px] leading-snug text-[var(--text-muted)]">
        {isCase
          ? "Кейс как в CS: приз (товар или скидка) случайно выбирается при оформлении, покупатель открывает кейс в заказе. Вместо кейса можно предложить гарантированную скидку."
          : "В заказ всегда кладётся один и тот же товар."}
      </p>
    </div>
  );
}

/** The promo reminder and the average margin — only for the case mode. */
function CaseNumbers({ reminder, margin, onChange }: { reminder: FieldProps | null; margin: FieldProps | null; onChange: Change }) {
  if (!reminder && !margin) return null;
  return (
    <div className="grid min-w-0 grid-cols-1 gap-3 border-t border-[var(--line)] pt-4 min-[480px]:grid-cols-2">
      {reminder && <NumField {...reminder} label="Напомнить о промокоде из кейса" onChange={(v) => onChange(GIFT_SETTING.promoReminder, v)} />}
      {margin && <NumField {...margin} label="Средняя маржа товаров" onChange={(v) => onChange(GIFT_SETTING.margin, v)} />}
    </div>
  );
}
