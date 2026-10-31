"use client";

import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, ArrowDown, ArrowUp, GitMerge } from "lucide-react";
import { Button } from "@shop/ui/admin-button";
import { Select } from "@/components/ui/Select";
import { cn } from "@/lib/cn";
import { uid, type Draft } from "../../model/attribute-draft";
import { optionValueFrom } from "../../model/identifiers";
import { productsWord } from "../../model/words";
import { TagInput } from "../TagInput";
import { AddLink, CELL, Errors, MiniBtn, RemoveBtn, SectionTitle } from "./parts";
import type { OptionEditing } from "./use-option-editing";

/** Список опций enum/multi: значения, подписи на трёх языках, алиасы, порядок, «объединить с…». */
export function OptionsEditor({
  d,
  used,
  errors,
  setD,
  opt,
}: {
  d: Draft;
  used: number;
  errors: string[];
  setD: (f: (p: Draft) => Draft) => void;
  opt: OptionEditing;
}) {
  const { mergeFor, setMergeFor, mergeTarget, setMergeTarget, merging, forcedRemovals, updateOpt, moveOpt, removeOpt, doMerge, forceRemove } = opt;
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <SectionTitle>
          Опции <span className="tabular text-[var(--text-faint)]">· {d.options.length}</span>
        </SectionTitle>
        <AddLink
          onClick={() =>
            setD((p) => ({
              ...p,
              options: [
                ...p.options,
                { uid: uid(), value: "", labelRu: "", labelUk: "", labelEn: "", aliases: [], valueTouched: false },
              ],
            }))
          }
        >
          Опция
        </AddLink>
      </div>
      {d.options.length === 0 && (
        <p className="text-[12.5px] text-[var(--text-faint)]">
          Значения, из которых выбирают (сенсоры, свитчи, подключение…). Значение — латинский slug, он хранится в товаре.
        </p>
      )}
      <div className="flex flex-col gap-2">
        <AnimatePresence initial={false}>
          {d.options.map((o, i) => {
            const locked = !!o.original && (o.usedCount ?? (used > 0 ? 1 : 0)) > 0;
            return (
              <motion.div
                key={o.uid}
                layout
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0 }}
                className="rounded-[var(--r-lg)] border border-[var(--line)] bg-[var(--bg-2)] p-2.5"
              >
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-[120px_1fr_1fr_1fr]">
                  <input
                    className={cn(CELL, "font-mono")}
                    aria-label={`Опция ${i + 1}: значение`}
                    placeholder="value"
                    value={o.value}
                    disabled={locked}
                    title={locked ? "Опция используется в товарах — значение не меняется" : undefined}
                    onChange={(e) =>
                      updateOpt(i, { value: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"), valueTouched: true })
                    }
                  />
                  <input
                    className={CELL}
                    aria-label={`Опция ${i + 1}: подпись RU`}
                    placeholder="RU"
                    value={o.labelRu}
                    onChange={(e) =>
                      updateOpt(i, {
                        labelRu: e.target.value,
                        ...(o.valueTouched ? {} : { value: optionValueFrom(e.target.value) }),
                      })
                    }
                  />
                  <input className={CELL} aria-label={`Опция ${i + 1}: подпись UK`} placeholder="UK" value={o.labelUk} onChange={(e) => updateOpt(i, { labelUk: e.target.value })} />
                  <input className={CELL} aria-label={`Опция ${i + 1}: подпись EN`} placeholder="EN" value={o.labelEn} onChange={(e) => updateOpt(i, { labelEn: e.target.value })} />
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 sm:flex-nowrap">
                  <span className="field-label shrink-0 !text-[10.5px] !text-[var(--text-faint)]">Алиасы</span>
                  <TagInput
                    dense
                    className="min-w-[180px] flex-1"
                    ariaLabel={`Опция ${i + 1}: алиасы`}
                    value={o.aliases}
                    onChange={(v) => updateOpt(i, { aliases: v })}
                    placeholder="другие написания: paw 3950, 3950…"
                  />
                  {o.usedCount != null && o.usedCount > 0 && (
                    <span className="tabular shrink-0 text-[11.5px] text-[var(--text-faint)]">{productsWord(o.usedCount)}</span>
                  )}
                  <div className="ml-auto flex shrink-0 items-center gap-1">
                    <MiniBtn label="Выше" disabled={i === 0} onClick={() => moveOpt(i, i - 1)}>
                      <ArrowUp className="h-3.5 w-3.5" />
                    </MiniBtn>
                    <MiniBtn label="Ниже" disabled={i === d.options.length - 1} onClick={() => moveOpt(i, i + 1)}>
                      <ArrowDown className="h-3.5 w-3.5" />
                    </MiniBtn>
                    <RemoveBtn label={`Удалить опцию ${o.labelRu || i + 1}`} onClick={() => removeOpt(i)} />
                  </div>
                </div>
                <AnimatePresence>
                  {mergeFor === o.uid && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="mt-2.5 rounded-[var(--r-md)] border border-[color-mix(in_srgb,var(--warn)_40%,transparent)] bg-[color-mix(in_srgb,var(--warn)_8%,transparent)] p-2.5">
                        <p className="flex items-start gap-2 text-[12.5px] leading-snug text-[var(--text)]">
                          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--warn)]" />
                          {o.usedCount && o.usedCount > 0
                            ? `Опция выбрана в ${productsWord(o.usedCount)}.`
                            : "Опция может быть выбрана в товарах."}{" "}
                          Объедините её с другой — товары перейдут на неё, а написание станет алиасом.
                        </p>
                        <div className="mt-2 flex flex-wrap items-end gap-2">
                          <Select
                            className="min-w-[200px] flex-1"
                            value={mergeTarget}
                            onChange={setMergeTarget}
                            placeholder="Объединить с…"
                            options={d.options
                              .filter((x) => x.uid !== o.uid && x.original)
                              .map((x) => ({ value: x.value, label: `${x.labelRu} (${x.value})` }))}
                          />
                          <Button size="sm" variant="surface" icon={<GitMerge className="h-3.5 w-3.5" />} disabled={!mergeTarget} loading={merging} onClick={() => doMerge(o)}>
                            Объединить
                          </Button>
                          <Button size="sm" variant="danger" onClick={() => forceRemove(o)}>
                            Удалить всё равно
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setMergeFor(null)}>
                            Отмена
                          </Button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
      {forcedRemovals.length > 0 && (
        <p className="text-[12px] text-[var(--danger-ink)]">
          При сохранении значения {forcedRemovals.map((v) => `«${v}»`).join(", ")} будут вычищены из товаров.
        </p>
      )}
      <Errors list={d.options.some((o) => o.value || o.labelRu) || d.options.length === 0 ? errors : []} />
    </section>
  );
}
