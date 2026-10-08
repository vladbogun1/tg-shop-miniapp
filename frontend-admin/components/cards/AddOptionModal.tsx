"use client";

/**
 * «Добавить опцию в схему»: the AI proposed a value that is not in the option list of an
 * enum/multi attribute. Adds it (PATCH replaces the whole list), then the screen re-checks the
 * same answer against the refreshed schema.
 */
import { useState } from "react";
import { ApiError } from "@/lib/api";
import type { Proposal } from "@/lib/card-check";
import { cardsApi } from "@/lib/cards-api";
import { slugify } from "@/lib/slug";
import { useToast } from "@/lib/toast";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal, ModalCancel } from "@/components/ui/Modal";

function optionSlug(label: string): string {
  return slugify(label).replace(/-+/g, "_").replace(/^_+|_+$/g, "").slice(0, 64);
}

export function AddOptionModal({ proposal, onClose, onAdded }: { proposal: Proposal; onClose: () => void; onAdded: () => void }) {
  const { push } = useToast();
  const attr = proposal.attr!;
  const [labelRu, setLabelRu] = useState(proposal.value);
  const [labelUk, setLabelUk] = useState(proposal.value);
  const [labelEn, setLabelEn] = useState(proposal.value);
  const [value, setValue] = useState(optionSlug(proposal.value));
  const [valueTouched, setValueTouched] = useState(false);
  const [aliases, setAliases] = useState(proposal.value);
  const [saving, setSaving] = useState(false);

  const slug = valueTouched ? value : optionSlug(labelEn || labelRu);
  const taken = attr.options.find((o) => o.value === slug);
  const error = !slug ? "Пустой код" : !/^[a-z0-9_]+$/.test(slug) ? "Только a–z, 0–9 и _" : taken ? `Уже есть: ${taken.labelRu}` : undefined;

  async function save() {
    if (error || !attr.id) return;
    setSaving(true);
    try {
      await cardsApi.updateAttributeOptions(attr.id, [
        ...attr.options.map((o) => ({
          value: o.value,
          labelRu: o.labelRu,
          labelUk: o.labelUk ?? o.labelRu,
          labelEn: o.labelEn ?? o.labelRu,
          aliases: o.aliases.join("\n"),
        })),
        {
          value: slug,
          labelRu: labelRu.trim(),
          labelUk: (labelUk || labelRu).trim(),
          labelEn: (labelEn || labelRu).trim(),
          aliases: aliases
            .split(/\n|,/)
            .map((a) => a.trim())
            .filter(Boolean)
            .join("\n"),
        },
      ]);
      push(`Опция «${labelRu.trim()}» добавлена в «${attr.labelRu}» — ответ проверен заново`, "ok");
      onAdded();
    } catch (e) {
      push(e instanceof ApiError ? e.message : "Не удалось сохранить опцию", "error");
    } finally {
      setSaving(false);
    }
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
