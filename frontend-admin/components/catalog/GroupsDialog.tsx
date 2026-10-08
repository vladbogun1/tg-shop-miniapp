"use client";

/**
 * «Группы характеристик» — the sections of the «Характеристики» block (Габариты и вес, Сенсор…):
 * key, labels ru/uk/en, order. Saved as a whole list (PUT). A group that attributes use cannot be
 * removed here (move the attributes first).
 */
import { motion, AnimatePresence } from "framer-motion";
import { ArrowDown, ArrowUp, Check, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { adminApi, ApiError, type AdminSpecGroup } from "@/lib/api";
import { isValidKey, keyFromLabel } from "@/lib/catalog-admin";
import { cn } from "@/lib/cn";
import { useToast } from "@/lib/toast";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";

const CELL =
  "h-9 w-full min-w-0 rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] px-2.5 text-[13px] text-[var(--text)] outline-none transition-[border-color,box-shadow] placeholder:text-[var(--text-faint)] hover:border-[var(--border-2)] focus:border-[var(--accent)] focus:shadow-[var(--ring-accent)] disabled:opacity-60";

interface Row extends AdminSpecGroup {
  uid: string;
  isNew: boolean;
  keyTouched: boolean;
}

let seq = 0;

export function GroupsDialog({
  open,
  groups,
  usedKeys,
  onClose,
  onSaved,
}: {
  open: boolean;
  groups: AdminSpecGroup[];
  /** Group keys that attributes reference. */
  usedKeys: Set<string>;
  onClose: () => void;
  onSaved: (g: AdminSpecGroup[]) => void;
}) {
  const { push } = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [initial, setInitial] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const r = [...groups]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((g) => ({ ...g, uid: `g${++seq}`, isNew: false, keyTouched: true }));
    setRows(r);
    setInitial(JSON.stringify(r));
  }, [open, groups]);

  const errors = useMemo(() => {
    const out: string[] = [];
    const seen = new Set<string>();
    rows.forEach((r, i) => {
      if (!isValidKey(r.key)) out.push(`Строка ${i + 1}: ключ — латиница, snake_case`);
      else if (seen.has(r.key)) out.push(`Строка ${i + 1}: ключ «${r.key}» повторяется`);
      seen.add(r.key);
      if (!r.labelRu.trim()) out.push(`Строка ${i + 1}: нет названия RU`);
    });
    return out;
  }, [rows]);

  const upd = (i: number, patch: Partial<Row>) => setRows((p) => p.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const move = (i: number, to: number) =>
    setRows((p) => {
      if (to < 0 || to >= p.length) return p;
      const n = [...p];
      const [m] = n.splice(i, 1);
      n.splice(to, 0, m);
      return n;
    });

  async function save() {
    setSaving(true);
    try {
      const saved = await adminApi.putSpecGroups(
        rows.map((r, i) => ({
          key: r.key,
          labelRu: r.labelRu.trim(),
          labelUk: r.labelUk.trim() || r.labelRu.trim(),
          labelEn: r.labelEn.trim() || r.labelRu.trim(),
          sortOrder: (i + 1) * 10,
        }))
      );
      push("Группы сохранены", "ok");
      onSaved(saved);
      onClose();
    } catch (e) {
      push(e instanceof ApiError ? e.message : "Не удалось сохранить", "error");
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
      dirty={open && JSON.stringify(rows) !== initial}
      title="Группы характеристик"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Отмена
          </Button>
          <Button variant="accent" loading={saving} disabled={errors.length > 0} icon={<Check className="h-4 w-4" />} onClick={save}>
            Сохранить
          </Button>
        </>
      }
    >
      <p className="mb-3 text-[13px] leading-relaxed text-[var(--text-muted)]">
        Разделы блока «Характеристики» на витрине — в этом порядке. Общие для всех категорий.
      </p>
      <div aria-hidden className="field-label mb-1.5 hidden grid-cols-[130px_1fr_1fr_1fr_116px] gap-2 !text-[10.5px] !text-[var(--text-faint)] sm:grid">
        <span>ключ</span>
        <span>RU</span>
        <span>UK</span>
        <span>EN</span>
        <span />
      </div>
      <div className="flex flex-col gap-2">
        <AnimatePresence initial={false}>
          {rows.map((r, i) => {
            const used = !r.isNew && usedKeys.has(r.key);
            return (
              <motion.div
                key={r.uid}
                layout
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0 }}
                className="grid grid-cols-3 gap-2 rounded-[var(--r-md)] border border-[var(--line)] p-2 sm:grid-cols-[130px_1fr_1fr_1fr_116px] sm:border-0 sm:p-0"
              >
                <input
                  className={cn(CELL, "col-span-3 font-mono sm:col-span-1")}
                  aria-label={`Группа ${i + 1}: ключ`}
                  value={r.key}
                  disabled={!r.isNew}
                  placeholder="key"
                  onChange={(e) => upd(i, { key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"), keyTouched: true })}
                />
                <input
                  className={CELL}
                  aria-label={`Группа ${i + 1}: RU`}
                  value={r.labelRu}
                  placeholder="RU"
                  onChange={(e) =>
                    upd(i, { labelRu: e.target.value, ...(r.isNew && !r.keyTouched ? { key: keyFromLabel(e.target.value).slice(0, 32) } : {}) })
                  }
                />
                <input className={CELL} aria-label={`Группа ${i + 1}: UK`} value={r.labelUk} placeholder="UK" onChange={(e) => upd(i, { labelUk: e.target.value })} />
                <input className={CELL} aria-label={`Группа ${i + 1}: EN`} value={r.labelEn} placeholder="EN" onChange={(e) => upd(i, { labelEn: e.target.value })} />
                <div className="col-span-3 flex justify-end gap-1 sm:col-span-1">
                  <Mini label="Выше" disabled={i === 0} onClick={() => move(i, i - 1)}>
                    <ArrowUp className="h-3.5 w-3.5" />
                  </Mini>
                  <Mini label="Ниже" disabled={i === rows.length - 1} onClick={() => move(i, i + 1)}>
                    <ArrowDown className="h-3.5 w-3.5" />
                  </Mini>
                  <Mini
                    label={used ? "Группа используется характеристиками" : "Удалить группу"}
                    disabled={used}
                    danger
                    onClick={() => setRows((p) => p.filter((_, j) => j !== i))}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Mini>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
      <button
        type="button"
        onClick={() =>
          setRows((p) => [...p, { key: "", labelRu: "", labelUk: "", labelEn: "", sortOrder: 0, uid: `g${++seq}`, isNew: true, keyTouched: false }])
        }
        className="focusable font-display mt-3 flex items-center gap-1 rounded-[var(--r-sm)] text-[11.5px] font-bold uppercase tracking-[0.06em] text-[var(--accent-hi)] hover:underline"
      >
        <Plus className="h-3.5 w-3.5" /> Группа
      </button>
      {errors.length > 0 && rows.some((r) => r.labelRu || r.key) && (
        <p className="mt-2 text-[12px] text-[var(--danger-ink)]">{errors[0]}</p>
      )}
    </Modal>
  );
}

function Mini({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "focusable grid h-9 w-9 place-items-center rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] text-[var(--text-muted)] transition-colors disabled:opacity-30",
        danger
          ? "enabled:hover:border-[color-mix(in_srgb,var(--danger)_45%,transparent)] enabled:hover:bg-[color-mix(in_srgb,var(--danger)_14%,transparent)] enabled:hover:text-[var(--danger-ink)]"
          : "enabled:hover:bg-[var(--surface-3)] enabled:hover:text-[var(--text)]"
      )}
    >
      {children}
    </button>
  );
}
