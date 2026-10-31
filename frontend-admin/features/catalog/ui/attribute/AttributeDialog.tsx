"use client";

/**
 * Attribute editor (a characteristic of a category, or a global one): labels ru/uk/en, key (latin
 * snake_case, auto-transliterated from the Russian label, locked once products use it), type,
 * units, group, storefront flags, facet buckets for numbers, the option list for enum/multi with
 * aliases, and a hint for the AI. Removing an option products use offers «объединить с…»
 * (rewrites their specs to another option) or a forced delete.
 */
import { Check } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@shop/ui/admin-button";
import { Modal } from "@shop/ui/overlay";
import { Textarea } from "@/components/ui/Textarea";
import {
  buildAttributeBody,
  bucketErrorsOf,
  isChoiceType,
  keyErrorOf,
  optionErrorsOf,
  toDraft,
  type Draft,
} from "../../model/attribute-draft";
import { keyFromLabel } from "../../model/identifiers";
import type { AdminSpecAttribute, AdminSpecGroup } from "../../model/types";
import { plural, productsWord } from "../../model/words";
import { useSaveAttribute } from "../../queries";
import { AttributeFlags } from "./AttributeFlags";
import { AttributeLabels } from "./AttributeLabels";
import { AttributeUnits } from "./AttributeUnits";
import { BucketsEditor } from "./BucketsEditor";
import { OptionsEditor } from "./OptionsEditor";
import { useOptionEditing } from "./use-option-editing";

export function AttributeDialog({
  open,
  attribute,
  categoryId,
  categoryName,
  groups,
  takenKeys,
  highlightOthers,
  onClose,
}: {
  open: boolean;
  /** null = new attribute. */
  attribute: AdminSpecAttribute | null;
  /** Where a new attribute is created; null = global. */
  categoryId: string | null;
  categoryName: string;
  groups: AdminSpecGroup[];
  /** Keys already used on the category path (globals, parent, siblings of this one). */
  takenKeys: string[];
  /** How many OTHER attributes of the category path are «на карточке товара». */
  highlightOthers: number;
  onClose: () => void;
}) {
  const saveAttribute = useSaveAttribute();
  const sortedGroups = useMemo(() => [...groups].sort((a, b) => a.sortOrder - b.sortOrder), [groups]);
  const defaultGroup = sortedGroups.find((g) => g.key === "main")?.key ?? sortedGroups[0]?.key ?? "main";
  // The draft is rebuilt when the dialog opens or the attribute changes — not when the groups list loads.
  const defaultGroupRef = useRef(defaultGroup);
  defaultGroupRef.current = defaultGroup;
  const [d, setD] = useState<Draft>(() => toDraft(attribute, defaultGroup));
  const [initial, setInitial] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const fresh = toDraft(attribute, defaultGroupRef.current);
    setD(fresh);
    setInitial(JSON.stringify(fresh));
  }, [open, attribute]);

  const used = attribute?.usedCount ?? 0;
  const opt = useOptionEditing(open, attribute, d, setD, used);
  const keyLocked = !!attribute && used > 0;
  const typeLocked = !!attribute && used > 0;
  const dirty = open && JSON.stringify(d) !== initial;

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));

  // Key follows the Russian label until it is edited by hand.
  function setLabelRu(v: string) {
    setD((p) => ({ ...p, labelRu: v, key: p.keyTouched ? p.key : keyFromLabel(v) }));
  }

  const keyError = keyErrorOf(d, attribute, takenKeys);
  const optionErrors = useMemo(() => optionErrorsOf(d), [d]);
  const bucketErrors = useMemo(() => bucketErrorsOf(d), [d]);
  const labelsMissing = !d.labelRu.trim() || !d.labelUk.trim() || !d.labelEn.trim();
  const canSave = !labelsMissing && !keyError && optionErrors.length === 0 && bucketErrors.length === 0;

  async function save() {
    if (!canSave) return;
    setSaving(true);
    try {
      const ok = await saveAttribute({
        attribute,
        body: buildAttributeBody(d, attribute, categoryId),
        force: opt.forcedRemovals.length > 0,
      });
      if (ok) onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      closeOnBackdrop={false}
      dirty={dirty}
      title={attribute ? `Характеристика · ${attribute.labelRu}` : "Новая характеристика"}
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <span className="text-[12px] text-[var(--text-faint)]">
            {categoryId || attribute?.categoryId ? `Категория «${categoryName}»` : "Глобальная — во всех категориях"}
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose} disabled={saving}>
              Отмена
            </Button>
            <Button
              variant="accent"
              loading={saving}
              disabled={!canSave}
              icon={<Check className="h-4 w-4" />}
              onClick={save}
            >
              {attribute ? "Сохранить" : "Добавить"}
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <AttributeLabels
          d={d}
          attribute={attribute}
          sortedGroups={sortedGroups}
          used={used}
          keyLocked={keyLocked}
          typeLocked={typeLocked}
          keyError={keyError}
          set={set}
          setD={setD}
          setLabelRu={setLabelRu}
        />
        <AttributeUnits d={d} set={set} />
        <AttributeFlags d={d} highlightOthers={highlightOthers} set={set} />
        {d.type === "number" && <BucketsEditor d={d} errors={bucketErrors} setD={setD} />}
        {isChoiceType(d.type) && <OptionsEditor d={d} used={used} errors={optionErrors} setD={setD} opt={opt} />}

        <Textarea
          label="Подсказка для ИИ"
          rows={2}
          value={d.hint}
          onChange={(e) => set("hint", e.target.value)}
          placeholder="Как заполнять: «без учёта кабеля; „57 ± 3 г“ → 57»"
          hint="Попадает в промпт «Карточек». На витрине не показывается."
        />
        {labelsMissing && (d.labelRu || d.labelUk || d.labelEn) && (
          <p className="text-[12px] text-[var(--text-faint)]">Нужны подписи на трёх языках.</p>
        )}
        {attribute && used > 0 && (
          <p className="text-[12px] text-[var(--text-faint)]">
            Заполнена в {productsWord(used)}. Удаление характеристики вычистит её из {plural(used, "этого товара", "этих товаров", "этих товаров")}.
          </p>
        )}
      </div>
    </Modal>
  );
}
