"use client";

/**
 * «Добавить опцию в схему»: the AI proposed a value that is not in the option list of an
 * enum/multi attribute. Adds it (PATCH replaces the whole list), then the screen re-checks the
 * same answer against the refreshed schema.
 */
import { useState } from "react";
import { optionsWithNew, type Proposal } from "../model";
import { cardsApi } from "../api";
import { slugify } from "@/features/catalog";
import { Button } from "@shop/ui/admin-button";
import { Input } from "@/components/ui/Input";
import { Modal, ModalCancel } from "@shop/ui/overlay";
import { useApiMutation } from "@shop/ui/mutation";

function optionSlug(label: string): string {
  return slugify(label).replace(/-+/g, "_").replace(/^_+|_+$/g, "").slice(0, 64);
}

export function AddOptionModal({ proposal, onClose, onAdded }: { proposal: Proposal; onClose: () => void; onAdded: () => void }) {
  const attr = proposal.attr!;
  const [labelRu, setLabelRu] = useState(proposal.value);
  const [labelUk, setLabelUk] = useState(proposal.value);
  const [labelEn, setLabelEn] = useState(proposal.value);
  const [value, setValue] = useState(optionSlug(proposal.value));
  const [valueTouched, setValueTouched] = useState(false);
  const [aliases, setAliases] = useState(proposal.value);

  const slug = valueTouched ? value : optionSlug(labelEn || labelRu);
  const taken = attr.options.find((o) => o.value === slug);
  const error = !slug ? "Пустой код" : !/^[a-z0-9_]+$/.test(slug) ? "Только a–z, 0–9 и _" : taken ? `Уже есть: ${taken.labelRu}` : undefined;

  const saveOption = useApiMutation({
    mutationFn: () =>
      cardsApi.updateAttributeOptions(attr.id!, optionsWithNew(attr, { value: slug, labelRu, labelUk, labelEn, aliases })),
    errorFallback: "Не удалось сохранить опцию",
    success: `Опция «${labelRu.trim()}» добавлена в «${attr.labelRu}» — ответ проверен заново`,
    onSuccess: onAdded,
  });
  const saving = saveOption.isPending;

  function save() {
    if (error || !attr.id) return;
    saveOption.mutate();
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      closeOnBackdrop={false}
      title={`Новая опция: ${attr.labelRu}`}
      footer={
        <>
          <ModalCancel disabled={saving} />
          <Button variant="accent" loading={saving} disabled={!!error || !labelRu.trim()} onClick={save}>
            Добавить
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-[13px] leading-relaxed text-[var(--text-muted)]">
          ИИ предложил значение <b className="text-[var(--text)]">«{proposal.value}»</b>
          {proposal.why ? ` (${proposal.why})` : ""}. Сейчас в списке {attr.options.length} опций. Проверьте подписи — они видны покупателям
          в фильтрах сайта и Mini App.
        </p>
        <Input label="Подпись (рус.)" value={labelRu} onChange={(e) => setLabelRu(e.target.value)} />
        <Input label="Підпис (укр.)" value={labelUk} onChange={(e) => setLabelUk(e.target.value)} />
        <Input label="Label (EN)" value={labelEn} onChange={(e) => setLabelEn(e.target.value)} />
        <Input
          label="Код (value)"
          value={slug}
          error={error}
          hint="Хранится в характеристиках товаров и в адресах фильтров — потом не меняется"
          onChange={(e) => {
            setValueTouched(true);
            setValue(e.target.value.toLowerCase());
          }}
        />
        <Input label="Алиасы (через запятую)" value={aliases} onChange={(e) => setAliases(e.target.value)} hint="Как значение пишут в источниках — для автоподбора" />
      </div>
    </Modal>
  );
}
