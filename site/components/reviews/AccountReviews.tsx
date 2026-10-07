"use client";

/**
 * Account → Відгуки (V44): lines waiting for a review (with the form), my reviews (moderation status,
 * shop reply, edit while PENDING) and my bonus codes (personal single-use promo codes).
 * `?order=<id>` (from the order page CTA) opens the forms of that order's lines first.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Gift, MessageSquareText, PartyPopper, Pencil, Ticket } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { BonusCode, MyReview, PendingReviewLine, ReviewStatus, SubmitReviewResult } from "@shop/shared";
import { Button } from "@/components/ui/Button";
import { CopyButton } from "@/components/ui/CopyButton";
import type { MessageKey } from "@/i18n";
import { useI18n } from "@/i18n/context";
import { api } from "@/lib/api";
import { Image } from "@/lib/image";
import { useFmt } from "@/lib/use-fmt";
import { ShopReply } from "./ProductReviews";
import { ReviewForm } from "./ReviewForm";
import { Stars } from "./Stars";

export function AccountReviews() {
  const { t, locale } = useI18n();
  const qc = useQueryClient();
  const pending = useQuery({ queryKey: ["me", "reviews", "pending", locale], queryFn: () => api.pendingReviews() });
  const mine = useQuery({ queryKey: ["me", "reviews", "mine", locale], queryFn: () => api.myReviews() });
  const bonuses = useQuery({ queryKey: ["me", "bonuses"], queryFn: () => api.myBonuses() });
  const [last, setLast] = useState<SubmitReviewResult | null>(null);
  const [focusOrder, setFocusOrder] = useState<string | null>(null);
  const topRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setFocusOrder(new URLSearchParams(window.location.search).get("order"));
  }, []);

  function done(res: SubmitReviewResult) {
    setLast(res);
    void qc.invalidateQueries({ queryKey: ["me", "reviews"] });
    void qc.invalidateQueries({ queryKey: ["me", "bonuses"] });
    window.setTimeout(() => topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  const pendingLines = (pending.data ?? [])
    .slice()
    .sort((a, b) => Number(b.orderId === focusOrder) - Number(a.orderId === focusOrder));

  return (
    <div className="flex flex-col gap-8">
      <div ref={topRef} className="scroll-mt-[calc(var(--header-h)+24px)]">
        {last && <Thanks result={last} onClose={() => setLast(null)} />}
      </div>

      <Section icon={<MessageSquareText className="h-5 w-5" />} title={t("reviews.pending.title")} id="pending">
        <p className="-mt-2 mb-3 text-[13px] font-medium text-[var(--muted)]">{t("reviews.pending.hint")}</p>
        <Loadable q={pending} empty={t("reviews.pending.empty")}>
          <ul className="flex flex-col gap-3">
            {pendingLines.map((line) => (
              <PendingItem key={line.orderItemId} line={line} startOpen={line.orderId === focusOrder} onDone={done} />
            ))}
          </ul>
        </Loadable>
      </Section>

      <Section icon={<Pencil className="h-5 w-5" />} title={t("reviews.mine.title")} id="mine">
        <Loadable q={mine} empty={t("reviews.mine.empty")}>
          <ul className="flex flex-col gap-3">
            {(mine.data ?? [])
              .slice()
              .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
              .map((r) => (
                <MyReviewItem key={r.id} review={r} onDone={done} />
              ))}
          </ul>
        </Loadable>
      </Section>

      <Section icon={<Ticket className="h-5 w-5" />} title={t("reviews.bonuses.title")} id="bonuses">
        <Loadable q={bonuses} empty={t("reviews.bonuses.empty")}>
          <ul className="grid gap-3 sm:grid-cols-2">
            {(bonuses.data ?? []).map((b) => (
              <BonusItem key={b.code} bonus={b} />
            ))}
          </ul>
        </Loadable>
      </Section>
    </div>
  );
}

function Section({ icon, title, id, children }: { icon: React.ReactNode; title: string; id: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={`rv-${id}`}>
      <h2 id={`rv-${id}`} className="mb-4 flex items-center gap-2.5 font-display text-[18px] font-extrabold uppercase tracking-[.03em] text-[var(--ink)] sm:text-[20px]">
        <span className="text-[var(--accent)]">{icon}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Loadable<T>({
  q,
  empty,
  children,
}: {
  q: { data?: T[]; isLoading: boolean; isError: boolean; refetch: () => unknown };
  empty: string;
  children: React.ReactNode;
}) {
  const { t } = useI18n();
  if (q.isLoading) return <div className="shimmer h-24" />;
  if (q.isError) {
    return (
      <div className="nb flex flex-col items-start gap-3 p-5">
        <p className="text-[14px] font-semibold text-[var(--danger)]">{t("reviews.error")}</p>
        <Button variant="accent" size="sm" onClick={() => void q.refetch()}>
          {t("common.retry")}
        </Button>
      </div>
    );
  }
  if (!q.data || q.data.length === 0) {
    return <p className="nb-flat p-4 text-[14px] font-medium text-[var(--muted)]">{empty}</p>;
  }
  return <>{children}</>;
}

function ProductHead({
  title,
  slug,
  variantName,
  imageUrl,
  children,
}: {
  title: string;
  slug?: string | null;
  variantName?: string | null;
  imageUrl?: string | null;
  children?: React.ReactNode;
}) {
  const { href } = useI18n();
  return (
    <div className="flex items-center gap-3">
      <span className="h-14 w-14 shrink-0 overflow-hidden rounded-[var(--r)] border border-[var(--line)] bg-[var(--surface-2)]">
        <Image src={imageUrl} alt={title} size={140} className="h-full w-full" />
      </span>
      <div className="min-w-0 flex-1">
        {slug ? (
          <Link href={href(`/product/${slug}`)} className="line-clamp-2 text-[14px] font-semibold text-[var(--ink)] transition-colors hover:text-[var(--accent-hi)]">
            {title}
          </Link>
        ) : (
          <p className="line-clamp-2 text-[14px] font-semibold text-[var(--ink)]">{title}</p>
        )}
        {variantName && <p className="text-[12px] font-semibold text-[var(--muted)]">{variantName}</p>}
        {children}
      </div>
    </div>
  );
}

function PendingItem({
  line,
  startOpen,
  onDone,
}: {
  line: PendingReviewLine;
  startOpen: boolean;
  onDone: (r: SubmitReviewResult) => void;
}) {
  const { t } = useI18n();
  const fmt = useFmt();
  const [open, setOpen] = useState(startOpen);
  useEffect(() => {
    if (startOpen) setOpen(true);
  }, [startOpen]);
  return (
    <li className={`nb p-4 ${open ? "border-[var(--line-strong)]" : ""}`}>
      <ProductHead title={line.title} slug={line.productSlug} variantName={line.variantName} imageUrl={line.imageUrl}>
        {line.deliveredAt && <p className="text-[12px] font-medium text-[var(--faint)]">{fmt.date(line.deliveredAt)}</p>}
      </ProductHead>
      {open ? (
        <div className="mt-4 border-t border-[var(--line)] pt-4">
          <ReviewForm orderItemId={line.orderItemId} onDone={onDone} onCancel={() => setOpen(false)} />
        </div>
      ) : (
        <Button variant="accent" size="sm" className="mt-3" onClick={() => setOpen(true)}>
          {t("reviews.cta.button")}
        </Button>
      )}
    </li>
  );
}

const STATUS_COLOR: Record<ReviewStatus, string> = {
  PENDING: "var(--warn)",
  PUBLISHED: "var(--ok)",
  HIDDEN: "var(--faint)",
};

function ReviewStatusChip({ status }: { status: ReviewStatus }) {
  const { t } = useI18n();
  const color = STATUS_COLOR[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-display text-[11px] font-bold uppercase tracking-[.08em]"
      style={{ background: `color-mix(in srgb, ${color} 16%, transparent)`, color }}
    >
      <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      {t(`reviews.status.${status}` as MessageKey)}
    </span>
  );
}

function MyReviewItem({ review, onDone }: { review: MyReview; onDone: (r: SubmitReviewResult) => void }) {
  const { t } = useI18n();
  const fmt = useFmt();
  const [editing, setEditing] = useState(false);
  return (
    <li className="nb p-4">
      <ProductHead title={review.title} slug={review.productSlug} variantName={review.variantName} imageUrl={review.imageUrl} />
      {editing ? (
        <div className="mt-4 border-t border-[var(--line)] pt-4">
          <ReviewForm
            orderItemId={review.orderItemId}
            initialRating={review.rating}
            initialText={review.text}
            edit
            onDone={(r) => {
              setEditing(false);
              onDone(r);
            }}
            onCancel={() => setEditing(false)}
          />
        </div>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
            <Stars value={review.rating} size={14} label={t("reviews.stars", { n: review.rating })} />
            <ReviewStatusChip status={review.status} />
            <time dateTime={review.createdAt} className="text-[12px] font-medium text-[var(--faint)]">
              {fmt.date(review.createdAt)}
            </time>
            {review.editable && (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="ml-auto inline-flex min-h-9 items-center gap-1.5 rounded-[var(--r)] border border-[var(--line)] px-3 text-[13px] font-semibold text-[var(--ink)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent-hi)]"
              >
                <Pencil className="h-3.5 w-3.5" strokeWidth={2.25} /> {t("reviews.edit")}
              </button>
            )}
          </div>
          {review.text && <p className="mt-2 whitespace-pre-line break-words text-[14px] leading-relaxed text-[#D4D4D8]">{review.text}</p>}
          {review.adminReply && <ShopReply text={review.adminReply} />}
        </>
      )}
    </li>
  );
}

const BONUS_COLOR: Record<BonusCode["state"], string> = {
  ACTIVE: "var(--ok)",
  USED: "var(--muted)",
  EXPIRED: "var(--faint)",
};

function BonusItem({ bonus }: { bonus: BonusCode }) {
  const { t } = useI18n();
  const fmt = useFmt();
  const active = bonus.state === "ACTIVE";
  const color = BONUS_COLOR[bonus.state];
  return (
    <li className={`nb flex flex-col gap-2 p-4 ${active ? "" : "opacity-70"}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-display text-[22px] font-extrabold tabular-nums text-[var(--accent)]">{t("product.discount", { n: bonus.percent })}</span>
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-display text-[11px] font-bold uppercase tracking-[.08em]"
          style={{ background: `color-mix(in srgb, ${color} 16%, transparent)`, color }}
        >
          {t(`reviews.bonus.state.${bonus.state}` as MessageKey)}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className={`min-w-0 flex-1 truncate rounded-[var(--r)] border border-dashed border-[var(--line-strong)] bg-[var(--surface-2)] px-3 py-2 font-display text-[15px] font-bold tracking-[.06em] ${active ? "text-[var(--ink)]" : "text-[var(--muted)] line-through"}`}>
          {bonus.code}
        </span>
        {active && <CopyButton value={bonus.code} label={t("reviews.bonus.code")} />}
      </div>
      {bonus.expiresAt && (
        <p className="text-[12px] font-medium text-[var(--muted)]">{t("reviews.bonus.until", { date: fmt.date(bonus.expiresAt) })}</p>
      )}
    </li>
  );
}

function Thanks({ result, onClose }: { result: SubmitReviewResult; onClose: () => void }) {
  const { t } = useI18n();
  const fmt = useFmt();
  const bonus = result.bonus;
  return (
    <div role="status" className="nb hud-frame flex flex-col gap-3 p-5">
      <p className="flex items-center gap-2 font-display text-[16px] font-bold uppercase tracking-[.04em] text-[var(--ink)]">
        <PartyPopper className="h-5 w-5 text-[var(--accent)]" strokeWidth={2} />
        {result.review.status === "PENDING" ? t("reviews.form.thanksModeration") : t("reviews.form.thanks")}
      </p>
      {bonus && (
        <div className="rounded-[var(--r)] border border-[var(--accent)] bg-[var(--accent-soft)] p-4">
          <p className="flex items-center gap-2 text-[14px] font-bold text-[var(--accent-hi)]">
            <Gift className="h-4 w-4" strokeWidth={2.25} /> {t("reviews.bonus.title", { n: bonus.percent })}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate rounded-[var(--r)] border border-dashed border-[var(--accent)] bg-[var(--surface)] px-3 py-2 font-display text-[16px] font-bold tracking-[.06em] text-[var(--ink)]">
              {bonus.code}
            </span>
            <CopyButton value={bonus.code} label={t("reviews.bonus.code")} />
          </div>
          <p className="mt-2 text-[12px] font-medium text-[var(--muted)]">
            {t("reviews.bonus.hint")}
            {bonus.expiresAt && <> {t("reviews.bonus.until", { date: fmt.date(bonus.expiresAt) })}</>}
          </p>
        </div>
      )}
      <Button variant="surface" size="sm" className="self-start" onClick={onClose}>
        {t("common.close")}
      </Button>
    </div>
  );
}
