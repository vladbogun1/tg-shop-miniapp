"use client";

import { motion } from "framer-motion";
import { Eye } from "lucide-react";
import { cn } from "@/lib/cn";
import { riseItem } from "@/lib/motion";
import { DEFAULT_BUTTON } from "../model/compose";
import type { Compose } from "./use-compose";

/** Подпись версии: что именно сейчас в пузыре. */
export function versionLabel(c: Pick<Compose, "editing" | "text" | "texts">): string {
  if (c.editing === "main") return "Основной текст";
  const code = c.editing.toUpperCase();
  return !c.text.trim() && c.texts.main.trim() ? `${code} пуст, уйдёт основной` : `Версия: ${code}`;
}

/** Пузырь Telegram с очищенным HTML (в карточке, в шторке телефона и в подтверждении). */
export function PreviewBubble({ c, compact = false }: { c: Compose; compact?: boolean }) {
  const { values, previewSource } = c;
  return (
    <div className="rounded-[var(--r-md)] border border-[var(--line)] bg-[#0e1621] p-4">
      <div className="max-w-[85%] rounded-[14px] rounded-tl-[4px] bg-[#17212b] p-3 shadow-[var(--shadow-2)]">
        {c.photo && (
          // eslint-disable-next-line @next/next/no-img-element -- local object URL, not a site image
          <img src={c.photo.previewUrl} alt="" className={cn("mb-2 w-full rounded-[8px] object-cover", compact ? "max-h-[110px]" : "max-h-[260px]")} />
        )}
        {previewSource.trim() ? (
          <div
            className={cn("tg-preview whitespace-pre-wrap break-words text-[14px] leading-relaxed text-white", compact && "line-clamp-6")}
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
  );
}

/** Карточка «Предпросмотр»: следует за вкладкой языка. */
export function PreviewCard({ c, sticky = false }: { c: Compose; sticky?: boolean }) {
  return (
    <motion.div
      variants={riseItem}
      className={cn("card flex min-w-0 flex-col gap-3 p-5", sticky && "lg:sticky lg:top-[calc(var(--hdr-h,61px)+16px)] lg:self-start")}
    >
      <div className="section-title flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <Eye className="h-4 w-4 text-[var(--accent)]" />
        Предпросмотр
        <span className="font-[family-name:var(--font-body)] text-[11.5px] font-medium normal-case tracking-normal text-[var(--text-faint)]">
          — {versionLabel(c)}
         
        </span>
      </div>
      <PreviewBubble c={c} />
      <p className="text-[11px] text-[var(--text-faint)]">Так увидит получатель; ссылки и теги очищены до набора Telegram.</p>
    </motion.div>
  );
}
