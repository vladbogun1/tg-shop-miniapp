"use client";

import { Button } from "@shop/ui/admin-button";
import { motion } from "framer-motion";
import { MessageSquareText, RotateCcw } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Textarea } from "@/components/ui/Textarea";
import { Toggle } from "@/components/ui/Toggle";
import { cn } from "@/lib/cn";
import { LANG_LABEL } from "@/lib/shop-lang";
import { riseItem } from "@/lib/motion";
import { DEFAULT_BUTTON, hasAnyText, MAX_LEN, TEXT_TABS, type TextKey } from "../model/compose";
import { FormatToolbar } from "./FormatToolbar";
import type { Compose } from "./use-compose";

function EditHint({ editing }: { editing: TextKey }) {
  return (
    <p className="text-[11px] text-[var(--text-faint)]">
      {editing === "main"
        ? "Основной текст получают все, для чьего языка нет отдельной версии."
        : `Версия для тех, кто читает магазин на языке «${LANG_LABEL[editing]}». Пусто — получат основной текст.`}
    </p>
  );
}

function Problems({ problems }: { problems: string[] }) {
  return (
    <ul className="flex flex-col gap-1 rounded-[var(--r-md)] border border-[color-mix(in_srgb,var(--danger)_40%,transparent)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] px-3 py-2">
      {problems.map((p) => (
        <li key={p} className="text-[12px] font-semibold text-[var(--danger-ink)]">
          {p}
        </li>
      ))}
    </ul>
  );
}

/** Карточка «Сообщение»: вкладки языков, разметка, поле текста, счётчик, кнопка под сообщением. */
export function ComposeCard({ c }: { c: Compose }) {
  const { values, texts, editing, text } = c;
  return (
    <motion.div variants={riseItem} className="card flex min-w-0 flex-col gap-3 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="section-title flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <MessageSquareText className="h-4 w-4 text-[var(--accent)]" />
          Сообщение
        </div>
        {hasAnyText(texts) && (
          <Button size="sm" variant="ghost" icon={<RotateCcw className="h-3.5 w-3.5" />} onClick={c.clearDraft}>
            Очистить черновик
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <SegmentedControl<TextKey>
          size="sm"
          value={editing}
          onChange={c.setEditing}
          options={TEXT_TABS.map((t) => ({
            value: t.value,
            label: t.label + (t.value !== "main" && texts[t.value].trim() ? " ✓" : ""),
          }))}
        />
        <EditHint editing={editing} />
      </div>

      <FormatToolbar wrap={c.wrap} />

      <Textarea
        id="bcast-ta"
        label={editing === "main" ? "Текст сообщения (HTML)" : `Текст: ${LANG_LABEL[editing]} (HTML)`}
        value={text}
        onChange={(e) => c.setText(e.target.value)}
        rows={9}
      />
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-[11px] text-[var(--text-faint)]">
          HTML Telegram: &lt;b&gt;, &lt;i&gt;, &lt;u&gt;, &lt;s&gt;, &lt;code&gt;, &lt;a href&gt;, &lt;blockquote&gt;.
          Эмодзи — как есть. Черновик сохраняется автоматически.
        </p>
        <span
          className={cn(
            "shrink-0 text-[12px] font-semibold tabular-nums",
            text.length > MAX_LEN ? "text-[var(--danger-ink)]" : "text-[var(--text-muted)]"
          )}
        >
          {text.length} / {MAX_LEN}
        </span>
      </div>

      {c.problems.length > 0 && hasAnyText(texts) && <Problems problems={c.problems} />}

      <div className="mt-1 flex flex-col gap-3 rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] p-4">
        <Toggle checked={values.withButton} onChange={(on) => c.setField("withButton", on)} label="Кнопка «Открыть магазин» под сообщением" />
        {values.withButton && (
          <Input
            label="Текст кнопки"
            value={values.buttonText}
            placeholder={`${DEFAULT_BUTTON} (на языке получателя)`}
            hint="Пусто — стандартная подпись на языке получателя."
            onChange={(e) => c.setField("buttonText", e.target.value)}
          />
        )}
      </div>
    </motion.div>
  );
}
