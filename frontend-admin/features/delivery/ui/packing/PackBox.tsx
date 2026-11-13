"use client";

/**
 * «Пакуй в» у заказа с ТТН (карточка «Отправки» и блок «Нова пошта» заказа): что советует система и почему,
 * выбор другой коробки или своих размеров, вес с весов и «Упаковано» → ТТН меняется под эту коробку.
 * Напечатанную ТТН Новая Почта не меняет — сервер создаёт новую с другим номером, поэтому сначала спрашиваем.
 * После подтверждения — строка «✓ Коробка … · кто, когда» с «Изменить».
 */
import { useMemo, useState } from "react";
import { Check, PackageCheck, Pencil } from "lucide-react";
import { errorMessage } from "@shop/core/errors";
import { formatShortDateTime } from "@shop/core/time";
import { Button } from "@shop/ui/admin-button";
import { useConfirm } from "@shop/ui/confirm";
import { Input } from "@/components/ui/Input";
import { toMm, weightText } from "../../model/format";
import { choiceByLabel, choiceLabel, confirmBody, isBagBox, npHasParcel, type PackChoice } from "../../model/packing";
import type { NpBox, Packing } from "../../model/types";
import { useBoxesQuery, useConfirmBox } from "../../queries-packing";
import { BoxGlyph } from "../boxes/BoxGlyph";
import { PackPicker } from "./PackPicker";

const PRINTED_WARNING =
  "Этикетка уже напечатана — НП не меняет напечатанную ТТН, будет создана новая с другим номером. Старую этикетку выбросить.";

function ChoiceGlyph({ boxes, choice }: { boxes: NpBox[]; choice: PackChoice | null }) {
  if (choice?.kind === "box") {
    const b = boxes.find((x) => x.id === choice.boxId);
    return b ? <BoxGlyph box={b} heightMm={choice.heightMm} size={44} className="shrink-0" /> : null;
  }
  if (choice?.kind === "custom") {
    const [l, w, h] = [toMm(choice.l), toMm(choice.w), toMm(choice.h)];
    if (l && w && h) return <BoxGlyph box={{ lengthMm: l, widthMm: w, heightsMm: [h] }} size={44} className="shrink-0" />;
  }
  return null;
}

function Confirmed({ p, onEdit }: { p: Packing; onEdit?: () => void }) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
      <Check className="h-4 w-4 shrink-0 text-[var(--ok)]" />
      <span className="min-w-0 flex-1 basis-48 break-words">
        <b className="font-semibold text-[var(--text)]">{p.boxLabel}</b>
        <span className="text-[var(--text-muted)]">
          {p.boxConfirmedBy ? ` · ${p.boxConfirmedBy}` : ""}
          {p.boxConfirmedAt ? `, ${formatShortDateTime(p.boxConfirmedAt)}` : ""}
        </span>
      </span>
      {onEdit && (
        <Button size="sm" variant="ghost" className="pointer-coarse:min-h-11" icon={<Pencil className="h-3.5 w-3.5" />} onClick={onEdit}>
          Изменить
        </Button>
      )}
    </div>
  );
}

/** Пакет в поштомат: сервер сложит его до ячейки — упаковщик должен свернуть так же. */
function BagFoldHint({ boxes, choice }: { boxes: NpBox[]; choice: PackChoice | null }) {
  const box = choice?.kind === "box" ? boxes.find((b) => b.id === choice.boxId) : undefined;
  if (!box || !isBagBox(box)) return null;
  return <p className="text-[12.5px] text-[var(--text-muted)]">В поштомат: сверните пакет по товару, не шире 40 см — в ТТН уйдёт сложенный размер.</p>;
}

/** Начальный выбор: подтверждённая коробка, иначе совет сервера (если он про одну коробку из списка). */
function initialChoice(boxes: NpBox[], p: Packing): PackChoice | null {
  if (p.boxId) return { kind: "box", boxId: p.boxId, heightMm: p.boxHeightMm };
  return choiceByLabel(boxes, p.boxSuggested);
}

function Picker({ orderId, ttn, p, postomat, onDone }: { orderId: string; ttn?: string | null; p: Packing; postomat: boolean; onDone: () => void }) {
  const q = useBoxesQuery();
  const all = useMemo(() => q.data?.boxes ?? [], [q.data]);
  const inStock = useMemo(() => {
    const own = all.filter((b) => b.inStock);
    return own.length > 0 ? own : all;
  }, [all]);
  const [picked, setPicked] = useState<PackChoice | null>(null);
  const [weight, setWeight] = useState("");
  const choice = picked ?? initialChoice(all, p);
  const confirm = useConfirm();
  const save = useConfirmBox(orderId, ttn, onDone);
  const body = choice ? confirmBody(choice, weight) : null;
  const suggested = !picked && !p.boxId;

  async function submit() {
    if (!body) return;
    if (p.printed && !npHasParcel(p.statusCode)) {
      const ok = await confirm({ title: "Этикетка уже напечатана", message: PRINTED_WARNING, confirmLabel: "Упаковано, новая ТТН" });
      if (!ok) return;
    }
    save.mutate(body);
  }

  return (
    <div className="flex min-w-0 flex-col gap-2.5">
      <div className="flex min-w-0 items-center gap-2.5">
        <ChoiceGlyph boxes={all} choice={choice} />
        <div className="min-w-0">
          <div className="break-words text-[14px] text-[var(--text)]">
            Пакуй в: <b className="font-semibold">{choice ? choiceLabel(all, choice) : (p.boxSuggested ?? "выберите коробку")}</b>
          </div>
          {suggested && p.boxSuggestedSource && <div className="text-[12px] text-[var(--text-faint)]">{p.boxSuggestedSource}</div>}
        </div>
      </div>
      <PackPicker
        boxes={inStock}
        choice={choice}
        postomat={postomat}
        onChoice={(c) => {
          save.reset();
          setPicked(c);
        }}
      />
      {postomat && <BagFoldHint boxes={all} choice={choice} />}
      {npHasParcel(p.statusCode) && <p className="text-[12.5px] text-[var(--text-muted)]">НП уже приняла посылку — ТТН не изменится, коробку запишем для статистики.</p>}
      <div className="flex min-w-0 flex-wrap items-end gap-2">
        <div className="w-36 min-w-0">
          <Input
            label="Вес, г"
            inputMode="numeric"
            placeholder="по товарам"
            value={weight}
            onChange={(e) => setWeight(e.target.value.replace(/[^\d]/g, ""))}
            hint={weight ? weightText(Number(weight)) : undefined}
          />
        </div>
        <Button
          variant="accent"
          className="flex-1 basis-40 pointer-coarse:min-h-11 sm:flex-none"
          loading={save.isPending}
          disabled={!body}
          icon={<PackageCheck className="h-4 w-4" />}
          onClick={submit}
        >
          Упаковано
        </Button>
      </div>
      {save.isError && (
        // Ошибка остаётся под кнопкой, пока не выбрана другая коробка — видно, что не так, без поиска тостов.
        <p role="alert" className="break-words text-[12.5px] font-semibold text-[var(--danger-ink)]">
          {errorMessage(save.error, undefined, "Не удалось подтвердить коробку")}
        </p>
      )}
    </div>
  );
}

export function PackBox({
  orderId,
  packing,
  ttn,
  onDone,
  readOnly,
  postomat = false,
}: {
  orderId: string;
  packing: Packing;
  /** Номер ТТН до подтверждения — для тоста «№… заменена на №…». */
  ttn?: string | null;
  /** Коробка подтверждена: перечитать заказ / списки. */
  onDone: () => void;
  /** Только показать подтверждённую коробку (заказ закрыт, ТТН не наша). */
  readOnly?: boolean;
  /** Посылка в поштомат: не влезающие в ячейку коробки выключены. */
  postomat?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const confirmed = !!packing.boxConfirmedAt && !!packing.boxLabel;
  if (readOnly && !confirmed) return null;
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] p-3" aria-label="Коробка посылки">
      {confirmed && (readOnly || !editing) ? (
        <Confirmed p={packing} onEdit={readOnly ? undefined : () => setEditing(true)} />
      ) : (
        <Picker
          orderId={orderId}
          ttn={ttn}
          p={packing}
          postomat={postomat}
          onDone={() => {
            setEditing(false);
            onDone();
          }}
        />
      )}
    </div>
  );
}
