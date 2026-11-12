"use client";

/**
 * «Какие коробки у вас есть?» — плитки всех коробок каталога и своих: значок, название, размер в см;
 * тап — «есть / нет» (PUT inStock). «+ Своя коробка» — имя, Д×Ш×В и линии сгиба. Один компонент для
 * первого запуска на «Отправке», окна «Коробки» и настроек.
 */
import { useState } from "react";
import { Check, Plus, Trash2 } from "lucide-react";
import { Button } from "@shop/ui/admin-button";
import { useConfirm } from "@shop/ui/confirm";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/cn";
import { boxSizeText, EMPTY_OWN_BOX, ownBoxBody, type OwnBoxForm } from "../../model/packing";
import type { NpBox } from "../../model/types";
import { useBoxesQuery, useCreateBox, useDeleteBox, useUpdateBox } from "../../queries-packing";
import { BoxGlyph } from "./BoxGlyph";

function BoxTile({ b }: { b: NpBox }) {
  const update = useUpdateBox();
  const remove = useDeleteBox();
  const confirm = useConfirm();
  // Пока запрос в полёте — показываем то, что нажали.
  const inStock = update.isPending && update.variables ? !!update.variables.body.inStock : b.inStock;
  async function askDelete() {
    if (await confirm({ title: `Удалить «${b.name}»?`, message: "Своя коробка пропадёт из списка.", confirmLabel: "Удалить", danger: true })) {
      remove.mutate(b.id);
    }
  }
  return (
    <div className="relative min-w-0">
      <button
        type="button"
        aria-pressed={inStock}
        onClick={() => update.mutate({ id: b.id, body: { inStock: !inStock } })}
        className={cn(
          "focusable nb-press flex min-h-[132px] w-full min-w-0 flex-col items-center gap-1.5 rounded-[var(--r-md)] border p-2.5 text-center transition-colors",
          inStock
            ? "border-[var(--accent)] bg-[var(--accent-soft)]"
            : "border-[var(--line)] bg-[var(--surface-2)] opacity-75 hover:opacity-100",
        )}
      >
        <BoxGlyph box={b} size={52} />
        <span className="w-full break-words text-[12.5px] font-semibold leading-tight text-[var(--text)]">{b.name}</span>
        <span className="tabular w-full break-words text-[11.5px] leading-tight text-[var(--text-muted)]">{boxSizeText(b)}</span>
        <span
          className={cn(
            "mt-auto inline-flex items-center gap-1 text-[11.5px] font-semibold",
            inStock ? "text-[var(--accent-hi)]" : "text-[var(--text-faint)]",
          )}
        >
          {inStock ? <Check className="h-3.5 w-3.5" /> : null}
          {inStock ? "есть" : "нет"}
        </span>
      </button>
      {b.own && (
        <button
          type="button"
          onClick={askDelete}
          aria-label={`Удалить «${b.name}»`}
          title="Удалить свою коробку"
          className="focusable absolute right-1 top-1 grid h-8 w-8 place-items-center rounded-[var(--r-sm)] text-[var(--text-faint)] hover:bg-[var(--surface-3)] hover:text-[var(--danger-ink)] pointer-coarse:h-10 pointer-coarse:w-10"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

function OwnBoxFields({ onClose }: { onClose: () => void }) {
  const [f, setF] = useState<OwnBoxForm>(EMPTY_OWN_BOX);
  const create = useCreateBox(onClose);
  const body = ownBoxBody(f);
  const set = (patch: Partial<OwnBoxForm>) => setF((x) => ({ ...x, ...patch }));
  return (
    <div className="card-2 flex min-w-0 flex-col gap-3 p-3">
      <Input label="Название" placeholder="Например: короб от клавиатуры" value={f.name} onChange={(e) => set({ name: e.target.value })} />
      <div className="min-w-0">
        <div className="field-label mb-1.5">Размер, см (Д × Ш × В)</div>
        <div className="grid grid-cols-3 gap-2">
          <Input aria-label="Длина, см" inputMode="decimal" placeholder="Д" value={f.l} onChange={(e) => set({ l: e.target.value })} />
          <Input aria-label="Ширина, см" inputMode="decimal" placeholder="Ш" value={f.w} onChange={(e) => set({ w: e.target.value })} />
          <Input aria-label="Высота, см" inputMode="decimal" placeholder="В" value={f.h} onChange={(e) => set({ h: e.target.value })} />
        </div>
      </div>
      <Input
        label="Линии сгиба, см (необязательно)"
        placeholder="13 8"
        inputMode="decimal"
        value={f.folds}
        onChange={(e) => set({ folds: e.target.value })}
        hint="Высоты, до которых коробку можно подрезать"
      />
      <div className="flex flex-wrap gap-2">
        <Button variant="accent" className="pointer-coarse:min-h-11" disabled={!body} loading={create.isPending} onClick={() => body && create.mutate(body)}>
          Добавить коробку
        </Button>
        <Button variant="ghost" className="pointer-coarse:min-h-11" onClick={onClose}>
          Отмена
        </Button>
      </div>
    </div>
  );
}

export function BoxEditor() {
  const q = useBoxesQuery();
  const [adding, setAdding] = useState(false);
  const boxes = q.data?.boxes ?? [];
  if (q.isError) return <p className="text-[13px] text-[var(--danger-ink)]">Не удалось загрузить коробки.</p>;
  if (q.isLoading) return <p className="text-[13px] text-[var(--text-muted)]">Загружаем коробки…</p>;
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="grid grid-cols-2 gap-2 min-[480px]:grid-cols-3 lg:grid-cols-4">
        {boxes.map((b) => (
          <BoxTile key={b.id} b={b} />
        ))}
      </div>
      {adding ? (
        <OwnBoxFields onClose={() => setAdding(false)} />
      ) : (
        <Button variant="surface" className="self-start pointer-coarse:min-h-11" icon={<Plus className="h-4 w-4" />} onClick={() => setAdding(true)}>
          Своя коробка
        </Button>
      )}
    </div>
  );
}
