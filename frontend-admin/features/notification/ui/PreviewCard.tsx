"use client";

import { motion } from "framer-motion";
import { Eye } from "lucide-react";
import { LANG_LABEL } from "@/lib/shop-lang";
import { riseItem } from "@/lib/motion";
import { DEFAULT_BUTTON } from "../model/compose";
import type { Compose } from "./use-compose";

/** Карточка «Предпросмотр»: пузырь Telegram с очищенным HTML. */
export function PreviewCard({ c }: { c: Compose }) {
  const { values, editing, text, texts, previewSource } = c;
  return (
    <motion.div variants={riseItem} className="card flex min-w-0 flex-col gap-3 p-5">
      <div className="section-title flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <Eye className="h-4 w-4 text-[var(--accent)]" />
        Предпросмотр
        {editing !== "main" && (
          <span className="font-[family-name:var(--font-body)] text-[11.5px] font-medium normal-case tracking-normal text-[var(--text-faint)]">
            — {LANG_LABEL[editing]}
            {!text.trim() && texts.main.trim() ? " (будет основной текст)" : ""}
          </span>
        )}
      </div>
      <div className="rounded-[var(--r-md)] border border-[var(--line)] bg-[#0e1621] p-4">
        <div className="max-w-[85%] rounded-[14px] rounded-tl-[4px] bg-[#17212b] p-3 shadow-[var(--shadow-2)]">
          {previewSource.trim() ? (
            <div
              className="tg-preview whitespace-pre-wrap break-words text-[14px] leading-relaxed text-white"
              // Sanitised to Telegram's tag subset (see @shop/shared): attributes are dropped
              // except safe hrefs, so the preview cannot execute what was pasted into it.
              dangerouslySetInnerHTML={{ __html: c.previewHtml }}
            />
          ) : (
            <div className="text-[13px] text-white/40">Сообщение появится здесь…</div>
          )}
          {values.withButton && (
            <div className="mt-2 rounded-[8px] bg-[#2b5278] px-3 py-2 text-center text-[14px] font-medium text-white">
              {values.buttonText.trim() || DEFAULT_BUTTON}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
