"use client";

import { Globe, Hourglass, MessageCircleQuestion, Package, Send } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Image } from "@/lib/image";
import { cn } from "@/lib/cn";
import { sourceLabel, type SupportThread } from "@/lib/support-api";

const CLOSED_BY: Record<string, string> = {
  CUSTOMER: "клиентом",
  ADMIN: "админом",
  AUTO: "автоматически",
};

/** «Открыт» / «Закрыт (кем)» + «Ждёт ответа». */
export function ThreadStatusBadges({ thread, className }: { thread: SupportThread; className?: string }) {
  const closedBy = thread.closedBy ? CLOSED_BY[thread.closedBy] : null;
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1.5", className)}>
      {thread.status === "OPEN" ? (
        <Badge tone="ok" dot>
          Открыт
        </Badge>
      ) : (
        <Badge tone="neutral" dot>
          {closedBy ? `Закрыт ${closedBy}` : "Закрыт"}
        </Badge>
      )}
      {thread.status === "OPEN" && thread.awaitingSince && (
        <Badge tone="accent">
          <Hourglass className="h-3 w-3" />
          Ждёт ответа
        </Badge>
      )}
    </span>
  );
}

/** Where the customer asked: Mini App (Telegram) or the site. */
export function ThreadSourceBadge({ source }: { source?: string | null }) {
  const web = source === "WEB";
  return (
    <Badge tone={web ? "info" : "neutral"}>
      {web ? <Globe className="h-3 w-3" /> : <Send className="h-3 w-3" />}
      {sourceLabel(source)}
    </Badge>
  );
}

/** Small square product picture; a general question shows a neutral tile. */
export function ProductThumb({ thread, className = "h-10 w-10" }: { thread: SupportThread; className?: string }) {
  const frame = cn("shrink-0 overflow-hidden rounded-[var(--r-sm)] border border-[var(--line)]", className);
  if (!thread.productImageUrl) {
    const Icon = thread.productId ? Package : MessageCircleQuestion;
    return (
      <div className={cn(frame, "grid place-items-center bg-[var(--surface-2)] text-[var(--text-faint)]")} aria-hidden>
        <Icon className="h-[45%] w-[45%]" />
      </div>
    );
  }
  return <Image src={thread.productImageUrl} alt={thread.productTitle ?? "Товар"} size={160} className={frame} />;
}

export function threadTopic(thread: SupportThread): string {
  return thread.productTitle || thread.subject || "Общий вопрос";
}

export function customerOf(thread: SupportThread): string {
  return thread.customerName?.trim() || (thread.userId ? `#${thread.userId}` : "Клиент");
}
