"use client";

import { PackageCheck, Gift } from "lucide-react";
import { money } from "@/lib/money";
import { cn } from "@/lib/cn";
import { Toggle } from "@/components/ui/Toggle";
import { unitPaid, unitsLeft } from "../../model/return-wizard";
import type { GiftChoice, ReturnOrderItem, ReturnWhere } from "../../model/types";
import { ChoiceCard, Counter, Thumb } from "../parts";
import type { ReturnWizard } from "./use-return-wizard";

/** Брак у товара, который уже у нас: «пришло целым» или «брак — спишется». */
function DefectControl({ w, it, q, d }: { w: ReturnWizard; it: ReturnOrderItem; q: number; d: number }) {
  return (
    <div className="flex flex-col gap-2 border-t border-[var(--line)] pt-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[12.5px] text-[var(--text-muted)]">
          {d > 0 ? `Брак — ${d} шт. спишется` : "Пришло целым — вернётся на склад"}
        </span>
        <Toggle checked={d > 0} onChange={(on) => w.setBroken(it, on ? (q > 1 ? 1 : q) : 0)} label="Брак" />
      </div>
      {d > 0 && q > 1 && (
        <Counter label="Сколько бракованных" value={d} min={1} max={q} onChange={(n) => w.setBroken(it, n)} />
      )}
    </div>
  );
}

/** Оплаченная строка заказа: «Вернуть», сколько штук, брак. */
export function PaidLineRow({ w, it, cur }: { w: ReturnWizard; it: ReturnOrderItem; cur: string }) {
  const { where, picked, defect } = w.choice;
  const max = unitsLeft(it);
  const q = picked[it.id!] ?? 0;
  const d = defect[it.id!] ?? 0;
  return (
    <div
      className={cn(
        "card-2 flex flex-col gap-2 px-3 py-2.5 transition-colors",
        q > 0 && "border-[color-mix(in_srgb,var(--accent)_45%,transparent)]",
      )}
    >
      <div className="flex items-center gap-3">
        <Thumb item={it} dim={q === 0} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13.5px] font-semibold text-[var(--text)]">{it.title}</div>
          <div className="text-[12px] text-[var(--text-faint)]">
            {it.variantName ? `${it.variantName} · ` : ""}
            {money(unitPaid(it), cur)}/шт. · в заказе {max} шт.
          </div>
        </div>
        <div className="shrink-0">
          <Toggle checked={q > 0} onChange={(on) => w.setPick(it, on ? max : 0)} label="Вернуть" />
        </div>
      </div>
      {q > 0 && max > 1 && (
        <Counter label="Сколько штук" value={q} min={1} max={max} onChange={(n) => w.setPick(it, n)} />
      )}
      {q > 0 && where === "HERE" && <DefectControl w={w} it={it} q={q} d={d} />}
    </div>
  );
}

function GiftRow({
  g,
  c,
  where,
  onChoose,
}: {
  g: ReturnOrderItem;
  c: GiftChoice | undefined;
  where: ReturnWhere;
  onChoose: (v: GiftChoice) => void;
}) {
  return (
    <div
      className={cn(
        "card-2 flex flex-col gap-2 px-3 py-2.5",
        !c && "border-[color-mix(in_srgb,var(--warn)_45%,transparent)]",
      )}
    >
      <div className="flex items-center gap-3">
        <Thumb item={g} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13.5px] font-semibold text-[var(--text)]">🎁 {g.title}</div>
          <div className="text-[12px] text-[var(--text-faint)]">
            {g.variantName ? `${g.variantName} · ` : ""}подарок · {unitsLeft(g)} шт.
          </div>
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <ChoiceCard
          active={c === "TAKE"}
          onClick={() => onChoose("TAKE")}
          icon={<PackageCheck className="h-4 w-4" />}
          label={where === "POST" ? "Забрать — пусть вернёт вместе" : "Забрать — вернулся вместе"}
        />
        <ChoiceCard
          active={c === "LEAVE"}
          onClick={() => onChoose("LEAVE")}
          icon={<Gift className="h-4 w-4" />}
          label="Оставить покупателю"
        />
      </div>
    </div>
  );
}

/** Подарок спрашивается отдельно по каждому: подарок за сумму и приз кейса могут решаться по-разному. */
export function GiftSection({ w }: { w: ReturnWizard }) {
  const { where, giftChoice } = w.choice;
  const { giftLines, allPaidBack } = w.d!;
  return (
    <section className="flex flex-col gap-2">
      <div className="field-label">
        {giftLines.length > 1 ? "Подарки в этом заказе — что с ними?" : "Подарок в этом заказе — что с ним?"}
      </div>
      <p className="text-[12.5px] text-[var(--text-muted)]">
        {allPaidBack
          ? "Покупатель возвращает весь оплаченный товар."
          : "Покупатель возвращает часть заказа — подарок мог быть за сумму, которой теперь нет."}{" "}
        Решите сами{giftLines.length > 1 ? " по каждому" : ""}:
      </p>
      {giftLines.map((g) => (
        <GiftRow key={g.id} g={g} c={giftChoice[g.id!]} where={where} onChoose={(v) => w.chooseGift(g.id!, v)} />
      ))}
      {giftLines.some((g) => !giftChoice[g.id!]) && (
        <p className="text-[12px] text-[var(--warn)]">Выберите, чтобы продолжить.</p>
      )}
    </section>
  );
}
