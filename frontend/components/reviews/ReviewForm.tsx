"use client";

/**
 * Compact review form (1–5 stars + text) and the "pending line" card that wraps it.
 *
 * Used on the delivered order page (the bot reminder deep-links there) and on the account
 * "Reviews" screen. Submitting the same line again edits my review while it is still PENDING —
 * the server decides; the form just posts.
 */
import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Copy, Gift, PartyPopper } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { useT } from "@/i18n/context";
import { ApiError } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { Image } from "@/lib/image";
import { spring } from "@/lib/motion";
import {
  REVIEW_MAX_LENGTH,
  REVIEW_MIN_LENGTH,
  reviewKeys,
  reviewsApi,
  type BonusCode,
  type PendingReviewLine,
  type SubmitReviewResult,
} from "@/lib/reviews";
import { haptic, hapticSuccess } from "@/lib/telegram";
import { StarInput } from "./Stars";

export function ReviewForm({
  orderItemId,
  productId,
  initialRating = 0,
  initialText = "",
  submitLabel,
  onDone,
  onCancel,
}: {
  orderItemId: number;
  productId?: string;
  initialRating?: number;
  initialText?: string;
  submitLabel?: string;
  onDone: (result: SubmitReviewResult) => void;
  onCancel?: () => void;
}) {
  const t = useT();
  const queryClient = useQueryClient();
  const [rating, setRating] = useState(initialRating);
  const [text, setText] = useState(initialText);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const len = text.trim().length;
  const tooShort = len < REVIEW_MIN_LENGTH;
  const canSubmit = rating >= 1 && !tooShort && !busy;

  async function submit() {
    if (!canSubmit) return;
    haptic();
    setBusy(true);
    setErr(null);
    try {
      const res = await reviewsApi.submit({ orderItemId, rating, text: text.trim() });
      hapticSuccess();
      void queryClient.invalidateQueries({ queryKey: reviewKeys.pendingAll });
      void queryClient.invalidateQueries({ queryKey: reviewKeys.mine });
      void queryClient.invalidateQueries({ queryKey: reviewKeys.bonuses });
      const pid = productId ?? res.review.productId;
      if (pid) void queryClient.invalidateQueries({ queryKey: reviewKeys.product(pid) });
      onDone(res);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : t("reviews.form.failed"));
    } finally {
      setBusy(false);
    }
  }

  const fieldId = `review-text-${orderItemId}`;
  return (
    <div className="flex flex-col gap-2">
      <StarInput value={rating} onChange={setRating} disabled={busy} />
      <label htmlFor={fieldId} className="sr-only">
        {t("reviews.form.textLabel")}
      </label>
      <textarea
        id={fieldId}
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, REVIEW_MAX_LENGTH))}
        placeholder={t("reviews.form.placeholder")}
        rows={3}
        maxLength={REVIEW_MAX_LENGTH}
        disabled={busy}
        className="w-full resize-none rounded-[var(--r)] border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2.5 text-[14px] text-[var(--ink)] outline-none placeholder:text-[var(--faint)] focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_var(--accent-soft)]"
      />
      <div className="flex items-center justify-between gap-3 px-0.5 text-[11px]">
        <span className={tooShort && len > 0 ? "text-[var(--warn)]" : "text-[var(--faint)]"}>
          {tooShort ? t("reviews.form.minHint", { n: REVIEW_MIN_LENGTH }) : rating < 1 ? t("reviews.form.pickStars") : ""}
        </span>
        <span className="tabular-nums text-[var(--faint)]" aria-live="polite">
          {text.length}/{REVIEW_MAX_LENGTH}
        </span>
      </div>
      {err && (
        <p role="alert" className="text-[12px] font-bold text-[var(--danger)]">
          {err}
        </p>
      )}
      <div className="flex gap-2">
        {onCancel && (
          <Button size="sm" className="flex-1" onClick={onCancel} disabled={busy}>
            {t("common.cancel")}
          </Button>
        )}
        <Button
          variant="accent"
          size="sm"
          className="flex-1"
          fullWidth={!onCancel}
          loading={busy}
          disabled={!canSubmit}
          onClick={submit}
        >
          {submitLabel ?? t("reviews.form.submit")}
        </Button>
      </div>
    </div>
  );
}

/** One delivered line waiting for a review: product header + the form, then a thank-you. */
export function PendingReviewCard({ line, index = 0 }: { line: PendingReviewLine; index?: number }) {
  const t = useT();
  const [result, setResult] = useState<SubmitReviewResult | null>(null);
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...spring, delay: index * 0.05 }}
      className="rounded-[var(--r)] border border-[var(--line)] bg-[var(--surface)] p-3"
    >
      <div className="mb-2 flex items-center gap-3">
        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-[var(--r)] bg-[var(--surface-2)]">
          <Image src={line.imageUrl} alt={line.title} size={96} className="h-full w-full" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-[13px] font-semibold text-[var(--ink)]">{line.title}</p>
          {(line.variantName || line.deliveredAt) && (
            <p className="truncate text-[11px] text-[var(--muted)]">
              {[line.variantName, line.deliveredAt ? t("reviews.deliveredAt", { date: formatDate(line.deliveredAt) }) : null]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
        </div>
      </div>
      <AnimatePresence mode="wait" initial={false}>
        {result ? (
          <motion.div key="done" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={spring}>
            <ReviewThanks result={result} />
          </motion.div>
        ) : (
          <motion.div key="form" exit={{ opacity: 0 }}>
            <ReviewForm orderItemId={line.orderItemId} productId={line.productId} onDone={setResult} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/** "Thanks!" + moderation note + the bonus code when the server issued one right away. */
export function ReviewThanks({ result }: { result: SubmitReviewResult }) {
  const t = useT();
  const pending = result.review.status === "PENDING";
  return (
    <div className="flex flex-col gap-2">
      <p className="font-display flex items-center gap-2 text-[14px] font-bold text-[var(--ok)]">
        <PartyPopper className="h-4 w-4" strokeWidth={2.5} aria-hidden />
        {t("reviews.thanks")}
      </p>
      <p className="text-[12px] text-[var(--muted)]">
        {pending ? t("reviews.thanksModeration") : t("reviews.thanksPublished")}
      </p>
      {result.bonus && <BonusCodeCard bonus={result.bonus} highlight />}
    </div>
  );
}

/** A personal promo code with a copy button, percent, valid-until and state. */
export function BonusCodeCard({ bonus, highlight }: { bonus: BonusCode; highlight?: boolean }) {
  const t = useT();
  const active = bonus.state === "ACTIVE";
  return (
    <div
      className={`flex items-center gap-3 rounded-[var(--r)] border px-3 py-2.5 ${
        highlight || active
          ? "border-[color-mix(in_srgb,var(--accent)_55%,transparent)] bg-[var(--accent-soft)]"
          : "border-[var(--line)] bg-[var(--surface-2)] opacity-70"
      }`}
    >
      <Gift className="h-5 w-5 shrink-0 text-[var(--accent)]" strokeWidth={2.25} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-display truncate text-[15px] font-bold tracking-[0.08em] text-[var(--ink)]">
          {bonus.code}
        </p>
        <p className="text-[11px] text-[var(--muted)]">
          {[
            t("reviews.bonus.percent", { n: bonus.percent }),
            bonus.expiresAt ? t("reviews.bonus.until", { date: formatDate(bonus.expiresAt) }) : null,
            t(`reviews.bonus.state.${bonus.state}`),
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
      {active && <CopyCode value={bonus.code} />}
    </div>
  );
}

function CopyCode({ value }: { value: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        haptic();
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1600);
        } catch {
          /* clipboard unavailable */
        }
      }}
      aria-label={copied ? t("reviews.bonus.copied") : t("reviews.bonus.copy", { code: value })}
      className="tap nb-press flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--r)] border border-[var(--line)] bg-[var(--surface-2)] text-[var(--ink)]"
    >
      {copied ? (
        <Check className="h-4 w-4 text-[var(--ok)]" strokeWidth={2.75} />
      ) : (
        <Copy className="h-4 w-4 text-[var(--muted)]" strokeWidth={2.5} />
      )}
    </button>
  );
}
