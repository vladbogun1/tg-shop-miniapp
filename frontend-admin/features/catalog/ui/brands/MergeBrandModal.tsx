"use client";

import { GitMerge } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { Button } from "@shop/ui/admin-button";
import { Modal } from "@shop/ui/overlay";
import { mergePreview } from "../../model/brand-dupes";
import type { AdminBrand } from "../../model/types";
import { productsWord } from "../../model/words";
import { useMergeBrands } from "../../queries";
import { BrandCombobox, type BrandValue } from "../BrandCombobox";

const NO_TARGET: BrandValue = { id: null, name: "" };

/**
 * «Объединить»: `group` — бренды, которые сливаем (один — «Объединить с…», несколько — группа дубликатов
 * или выбранные в таблице). Главный — любой из группы (по умолчанию с наибольшим числом товаров) либо
 * другой бренд из справочника. Показано «Было → Станет». Слияние необратимо; редиректов на сайте
 * при этом нет — адреса слитых брендов перестанут открываться.
 */
export function MergeBrandModal({
  group,
  brands,
  onClose,
}: {
  group: AdminBrand[] | null;
  brands: AdminBrand[];
  onClose: () => void;
}) {
  const [mainId, setMainId] = useState<string | null>(null);
  const [other, setOther] = useState<BrandValue>(NO_TARGET);
  const merge = useMergeBrands();
  const members = useMemo(() => group ?? [], [group]);
  const single = members.length === 1;

  useEffect(() => {
    setOther(NO_TARGET);
    setMainId(members.length > 1 ? [...members].sort((a, b) => b.productCount - a.productCount)[0].id : null);
  }, [members]);

  const target = useMemo(() => {
    const id = single || other.id ? other.id : mainId;
    return brands.find((b) => b.id === id) ?? null;
  }, [brands, single, other.id, mainId]);
  const sources = members.filter((m) => m.id !== target?.id);
  const preview = target ? mergePreview(target, sources) : null;

  return (
    <Modal
      open={!!group}
      onClose={onClose}
      size="md"
      title={single ? `Объединить «${members[0].name}»` : `Объединить ${members.length} брендов`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={merge.isPending}>
            Отмена
          </Button>
          <Button
            variant="accent"
            loading={merge.isPending}
            disabled={!target || sources.length === 0}
            icon={<GitMerge className="h-4 w-4" />}
            onClick={() => target && merge.mutate({ sources, target }, { onSuccess: onClose })}
          >
            {preview ? `Объединить ${productsWord(preview.products)}` : "Объединить"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {!single && (
          <fieldset className="flex flex-col gap-1.5">
            <legend className="field-label mb-1">Главный бренд</legend>
            {members.map((m) => (
              <label
                key={m.id}
                className={cn(
                  "flex min-h-11 cursor-pointer items-center gap-3 rounded-[var(--r-md)] border px-3 py-2 text-[14px]",
                  !other.id && mainId === m.id ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--line)] hover:bg-[var(--surface-hover)]"
                )}
              >
                <input type="radio" name="main-brand" className="accent-[var(--accent)]" checked={!other.id && mainId === m.id} onChange={() => (setOther(NO_TARGET), setMainId(m.id))} />
                <span className="min-w-0 flex-1 truncate font-semibold text-[var(--text)]">{m.name}</span>
                <span className="tabular shrink-0 text-[12px] text-[var(--text-faint)]">{productsWord(m.productCount)}</span>
              </label>
            ))}
          </fieldset>
        )}
        <BrandCombobox
          label={single ? "С каким брендом" : "Или другой бренд из справочника"}
          brands={brands}
          value={other}
          onChange={setOther}
          allowCreate={false}
          exclude={members.map((m) => m.id)}
        />

        {target && preview && (
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="card-2 rounded-[var(--r-md)] p-3">
              <div className="field-label mb-1.5">Было</div>
              <ul className="flex flex-col gap-1 text-[13px] text-[var(--text-muted)]">
                {[target, ...sources].map((b) => (
                  <li key={b.id} className="flex justify-between gap-2">
                    <span className="truncate">{b.name}</span>
                    <span className="tabular shrink-0 text-[var(--text-faint)]">{b.productCount}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="card-2 rounded-[var(--r-md)] p-3">
              <div className="field-label mb-1.5">Станет</div>
              <div className="text-[14px] font-semibold text-[var(--text)]">
                {target.name} <span className="tabular font-normal text-[var(--text-muted)]">· {productsWord(preview.products)}</span>
              </div>
              <div className="mt-1 text-[12.5px] text-[var(--text-muted)]">
                Алиасы: {preview.aliases.length ? preview.aliases.join(", ") : "—"}
              </div>
            </div>
          </div>
        )}
        <p className="text-[12.5px] leading-relaxed text-[var(--warn)]">
          Необратимо: {sources.length > 1 ? "остальные бренды будут удалены" : `«${sources[0]?.name ?? "бренд"}» будет удалён`}, а их товары и написания перейдут к главному. Отменить слияние нельзя.
        </p>
      </div>
    </Modal>
  );
}
