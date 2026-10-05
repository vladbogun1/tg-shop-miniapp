"use client";

/**
 * One review on «Отзывы»: stars + status, text, who wrote it (public signature + the customer's
 * name), product (opens the editor) + variant, order (opens over the page), dates, the shop's
 * public reply, and the actions: Опубликовать · Скрыть · Ответить (inline) · Удалить.
 */
import { motion } from "framer-motion";
import { Eye, EyeOff, MessageSquareReply, Package, Star, Trash2, UserRound } from "lucide-react";
import Link from "next/link";
import { useState, type CSSProperties } from "react";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { cn } from "@/lib/cn";
import { riseItem } from "@/lib/motion";
import { formatDateTime } from "@/lib/orders";
import { REVIEW_STATUS_LABEL, type AdminReview, type ReviewStatus } from "@/lib/reviews";

const STATUS_TONE: Record<ReviewStatus, string> = {
  PENDING: "var(--warn)",
  PUBLISHED: "var(--ok)",
  HIDDEN: "var(--text-muted)",
};

export type ReviewAction = "publish" | "hide" | "reply" | "delete";

export function Stars({ rating, className }: { rating: number; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)} aria-label={`Оценка ${rating} из 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          aria-hidden
          className={cn(
            "h-4 w-4",
            i <= rating ? "fill-[var(--accent)] text-[var(--accent)]" : "text-[var(--text-faint)] opacity-50"
          )}
          strokeWidth={1.75}
        />
      ))}
    </span>
  );
}

export function ReviewCard({
  review: r,
  busy,
  onPublish,
  onHide,
  onReply,
  onDelete,
  onOpenOrder,
}: {
  review: AdminReview;
  /** The action currently running on this review (its button shows a spinner). */
  busy: ReviewAction | null;
  onPublish: () => void;
  onHide: () => void;
  /** Resolves true when the reply was saved (the editor closes then). */
  onReply: (text: string) => Promise<boolean>;
  onDelete: () => void;
  onOpenOrder: (orderId: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  function startReply() {
    setDraft(r.adminReply ?? "");
    setEditing(true);
  }

  async function save(text: string) {
    if (await onReply(text)) setEditing(false);
  }

  const author = r.author?.trim() || "Покупатель";
  const customer = r.customerName?.trim();

  return (
    <motion.li variants={riseItem} className="card card-hover flex list-none flex-col gap-3 px-4 py-3.5">
      {/* Head: stars · status · dates */}
      <div className="flex flex-wrap items-center gap-2">
        <Stars rating={r.rating} />
        <span
          className={cn("chip-tint", r.status === "HIDDEN" && "!bg-[var(--surface-3)]")}
          style={{ "--chip": STATUS_TONE[r.status] } as CSSProperties}
        >
          <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
          {REVIEW_STATUS_LABEL[r.status]}
        </span>
        <span className="ml-auto text-[12px] text-[var(--text-faint)]">
          {formatDateTime(r.createdAt)}
          {r.publishedAt && r.status === "PUBLISHED" ? ` · опубл. ${formatDateTime(r.publishedAt)}` : ""}
        </span>
      </div>

      {/* Text */}
      <p className="whitespace-pre-line break-words text-[14px] leading-relaxed text-[var(--text)]">
        {r.text || <span className="text-[var(--text-faint)]">Без текста</span>}
      </p>

      {/* Who · product · order */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12.5px] text-[var(--text-muted)]">
        <span className="inline-flex min-w-0 items-center gap-1.5" title="Подпись на сайте · имя покупателя">
          <UserRound className="h-3.5 w-3.5 shrink-0 text-[var(--text-faint)]" />
          <span className="truncate">
            <b className="font-semibold text-[var(--text)]">{author}</b>
            {customer && customer !== author ? <span> · {customer}</span> : null}
          </span>
        </span>
        <Link
          href={`/products?edit=${r.productId}`}
          className="focusable inline-flex min-w-0 items-center gap-1.5 rounded-[var(--r-sm)] hover:text-[var(--accent-hi)] hover:underline"
          title="Открыть товар"
        >
          <Package className="h-3.5 w-3.5 shrink-0 text-[var(--text-faint)]" />
          <span className="truncate">
            {r.productTitle || "Товар"}
            {r.variantName ? <span className="text-[var(--text-faint)]"> · {r.variantName}</span> : null}
          </span>
        </Link>
        {r.orderId && (
          <button
            type="button"
            onClick={() => onOpenOrder(r.orderId!)}
            className="focusable font-display tabular inline-flex h-[22px] items-center rounded-[var(--r-sm)] border border-[var(--line)] bg-[var(--surface-2)] px-1.5 text-[12px] font-semibold tracking-[0.02em] text-[var(--text)] hover:border-[var(--line-strong)]"
            title="Открыть заказ"
          >
            #{r.orderShortId || r.orderId.slice(0, 8)}
          </button>
        )}
      </div>

      {/* Shop's public reply */}
      {r.adminReply && !editing && (
        <div className="card-2 rounded-[var(--r-md)] border-l-2 border-l-[var(--accent)] px-3 py-2 text-[13px] leading-snug">
          <div className="field-label !text-[10.5px]">
            Ответ магазина{r.adminReplyAt ? ` · ${formatDateTime(r.adminReplyAt)}` : ""}
          </div>
          <p className="mt-1 whitespace-pre-line break-words text-[var(--text)]">{r.adminReply}</p>
        </div>
      )}

      {editing && (
        <div className="flex flex-col gap-2">
          <Textarea
            label="Публичный ответ магазина"
            rows={3}
            value={draft}
            autoFocus
            maxLength={2000}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Спасибо за отзыв!"
          />
          <div className="flex flex-wrap items-center justify-end gap-2">
            {r.adminReply && (
              <Button
                variant="ghost"
                size="sm"
                disabled={busy === "reply"}
                onClick={() => void save("")}
                className="mr-auto hover:text-[var(--danger-ink)]"
              >
                Убрать ответ
              </Button>
            )}
            <Button variant="ghost" size="sm" disabled={busy === "reply"} onClick={() => setEditing(false)}>
              Отмена
            </Button>
            <Button
              variant="accent"
              size="sm"
              loading={busy === "reply"}
              disabled={!draft.trim() && !r.adminReply}
              onClick={() => void save(draft.trim())}
            >
              Сохранить
            </Button>
          </div>
        </div>
      )}

      {/* Actions */}
      {!editing && (
        <div className="flex flex-wrap items-center gap-2 border-t border-[var(--line)] pt-3">
          {r.status !== "PUBLISHED" && (
            <Button
              variant="surface"
              size="sm"
              className="!border-[rgba(255,102,0,.45)] !bg-[var(--accent-soft)] !text-[var(--accent-hi)] hover:!border-[var(--accent)]"
              loading={busy === "publish"}
              disabled={!!busy}
              icon={<Eye className="h-4 w-4" />}
              onClick={onPublish}
            >
              Опубликовать
            </Button>
          )}
          {r.status !== "HIDDEN" && (
            <Button
              variant="outline"
              size="sm"
              loading={busy === "hide"}
              disabled={!!busy}
              icon={<EyeOff className="h-4 w-4" />}
              onClick={onHide}
            >
              Скрыть
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            disabled={!!busy}
            icon={<MessageSquareReply className="h-4 w-4" />}
            onClick={startReply}
          >
            {r.adminReply ? "Изменить ответ" : "Ответить"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto hover:text-[var(--danger-ink)]"
            loading={busy === "delete"}
            disabled={!!busy}
            icon={<Trash2 className="h-4 w-4" />}
            onClick={onDelete}
          >
            Удалить
          </Button>
        </div>
      )}
    </motion.li>
  );
}
