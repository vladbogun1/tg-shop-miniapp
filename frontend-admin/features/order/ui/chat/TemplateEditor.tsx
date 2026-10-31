"use client";

/** Правка шаблона ответа: название и текст на ru / uk / en (русский обязателен). */
import { useLayoutEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { Modal, ModalCancel } from "@shop/ui/overlay";
import { Button } from "@shop/ui/admin-button";
import { useForm } from "@shop/ui/form";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import type { ReplyTemplate, ReplyTemplateWrite } from "../../api";
import {
  EMPTY_DRAFT,
  bodyLabel,
  canSaveDraft,
  draftOf,
  isDraftDirty,
  isTranslationStale,
  toWrite,
  type TemplateDraft,
  type TemplateLang,
} from "../../model/templates";
import { LOCALE_LABEL, PLACEHOLDERS } from "./template-meta";

export function TemplateEditor({
  open,
  template,
  saving,
  onClose,
  onSave,
}: {
  open: boolean;
  template: ReplyTemplate | null;
  saving: boolean;
  onClose: () => void;
  onSave: (body: ReplyTemplateWrite) => void;
}) {
  const form = useForm<TemplateDraft>({ defaultValues: EMPTY_DRAFT });
  const { reset, setValue: setField } = form;
  const draft = form.watch();
  // Russian first: the admin writes in Russian, the other languages are optional (typed here or
  // translated later in «Переводы», where an empty one shows up as missing).
  const [lang, setLang] = useState<TemplateLang>("ru");

  const id = template?.id ?? null;
  useLayoutEffect(() => {
    if (!open) return;
    reset(draftOf(template));
    setLang("ru");
    // Reset only when a different template is opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, id, reset]);

  const value = draft[lang];
  const stale = (l: "uk" | "en") => isTranslationStale(template, l, draft);
  const setValue = (v: string) => setField(lang, v);

  return (
    <Modal
      open={open}
      onClose={onClose}
      closeOnBackdrop={false}
      dirty={isDraftDirty(template, draft)}
      size="lg"
      title={template ? "Изменить шаблон" : "Новый шаблон"}
      footer={
        <>
          <ModalCancel />
          <Button variant="accent" loading={saving} disabled={!canSaveDraft(draft)} onClick={() => onSave(toWrite(draft, template?.sort))}>
            Сохранить
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Input label="Название (видите только вы)" {...form.register("title")} maxLength={128} />
        <div className="flex gap-1.5">
          {(["ru", "uk", "en"] as const).map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLang(l)}
              className={cn(
                "nb-chip nb-press h-8 px-3.5 text-[12px] uppercase tracking-[0.06em]",
                lang === l ? "nb-chip-active" : "text-[var(--text-muted)] hover:border-[var(--line-strong)] hover:text-[var(--text)]",
              )}
            >
              {LOCALE_LABEL[l]}
              {l === "ru" && " *"}
              {l !== "ru" && stale(l) && (
                <span className="ml-1 text-[var(--warn,#F59E0B)]" title="Перевод устарел">
                  •
                </span>
              )}
            </button>
          ))}
        </div>
        <Textarea label={bodyLabel(lang)} rows={7} value={value} maxLength={4000} onChange={(e) => setValue(e.target.value)} />
        {lang !== "ru" && (
          <p className={cn("-mt-1.5 text-[11.5px]", stale(lang) ? "text-[var(--warn,#F59E0B)]" : "text-[var(--text-faint)]")}>
            {stale(lang)
              ? "Перевод сделан для старого русского текста — в чате пока уходит русский. Обновите его здесь или во вкладке «Переводы»."
              : "Можно не заполнять: пустой появится во вкладке «Переводы» вместе с товарами. Пока перевода нет, клиенту уходит русский текст."}
          </p>
        )}
        <div className="flex flex-wrap gap-1.5">
          {PLACEHOLDERS.map((p) => (
            <button
              key={p.key}
              type="button"
              title={p.hint}
              onClick={() => setValue(value + p.key)}
              className="nb-press rounded-[var(--r-sm)] border border-[var(--line)] bg-[var(--surface-2)] px-2 py-1 font-mono text-[11.5px] text-[var(--text-muted)] transition-colors hover:border-[var(--line-strong)] hover:text-[var(--accent-hi)]"
            >
              {p.key}
            </button>
          ))}
        </div>
        <p className="text-[11.5px] text-[var(--text-faint)]">
          Плейсхолдеры подставятся из заказа: {PLACEHOLDERS.map((p) => `${p.key} — ${p.hint}`).join(", ")}.
        </p>
      </div>
    </Modal>
  );
}
