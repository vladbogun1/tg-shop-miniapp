"use client";

import { ExternalLink, Lock, PencilLine, RotateCcw } from "lucide-react";
import Link from "next/link";
import { Button } from "@shop/ui/admin-button";
import { formatDateTime } from "@shop/core/time";
import { siteProductUrl, threadTopic } from "../model/thread";
import type { SupportThread } from "../model/types";
import { ProductThumb } from "./parts";

const LINK_CLASS =
  "focusable hit inline-flex items-center gap-1 whitespace-nowrap rounded-[var(--r-sm)] text-[var(--text-muted)] hover:text-[var(--accent-hi)]";

/** Product card of the thread (admin editor + public page) and «Закрыть» / «Открыть снова». */
export function ThreadProductBar({
  thread,
  busy,
  onToggle,
}: {
  thread: SupportThread;
  busy: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="shrink-0 border-b border-[var(--line)] px-4 py-3 sm:px-5">
      <div className="flex flex-wrap items-center gap-3">
        <ProductThumb thread={thread} className="h-14 w-14" />
        <div className="min-w-[9rem] flex-1">
          <div className="field-label !text-[10.5px]">{thread.productId ? "Вопрос о товаре" : "Общий вопрос"}</div>
          <div className="mt-0.5 line-clamp-2 text-[14px] font-semibold leading-snug text-[var(--text)]">
            {threadTopic(thread)}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
            {thread.productId && (
              <Link href={`/products?edit=${encodeURIComponent(thread.productId)}`} className={LINK_CLASS}>
                <PencilLine className="h-3.5 w-3.5" />В админке
              </Link>
            )}
            {thread.productSlug && (
              <a href={siteProductUrl(thread.productSlug)} target="_blank" rel="noreferrer" className={LINK_CLASS}>
                <ExternalLink className="h-3.5 w-3.5" />
                На сайте
              </a>
            )}
            <span className="text-[var(--text-faint)]">с {formatDateTime(thread.createdAt)}</span>
          </div>
        </div>
        <Button
          variant={thread.status === "OPEN" ? "outline" : "surface"}
          size="sm"
          loading={busy}
          className="shrink-0 max-sm:w-full"
          icon={thread.status === "OPEN" ? <Lock className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}
          onClick={onToggle}
        >
          {thread.status === "OPEN" ? "Закрыть" : "Открыть снова"}
        </Button>
      </div>
    </div>
  );
}
