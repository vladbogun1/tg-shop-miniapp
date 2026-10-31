"use client";

/**
 * Review form for one order line: stars + text with a counter. Creates the review, or re-submits it
 * while it is still PENDING (same orderItemId). Server refusals (400) arrive already localized.
 */
import { useId } from "react";
import type { SubmitReviewResult } from "@shop/core/types";
import { REVIEW_MIN_LENGTH, useReviewForm, type ReviewFormPolicy } from "@shop/customer/review/use-review-form";
import { Button } from "@shop/ui/primitives";
import { useI18n } from "@/i18n/context";
import { api } from "@/lib/api";
import { StarInput } from "./StarInput";

/** The website text limit (ReviewRules.MAX_TEXT; the Mini App clamps to 2000); the server has the final word. */
const REVIEW_MAX = 4000;

/** The website: «Send» is active from the start and asks for the stars on click; length in characters. */
const REVIEW_FORM_POLICY: ReviewFormPolicy = { maxLength: REVIEW_MAX, countCharacters: true, gateSubmit: true, clampInput: false };

export function ReviewForm({
  orderItemId,
  initialRating = 0,
  initialText = "",
  edit = false,
  onDone,
  onCancel,
}: {
  orderItemId: number;
  initialRating?: number;
  initialText?: string;
  edit?: boolean;
  onDone: (result: SubmitReviewResult) => void;
  onCancel?: () => void;
}) {
  const { t } = useI18n();
  const id = useId();
  const { rating, setRating, text, setText, busy, err, len, canSubmit, submit } = useReviewForm({
    api: api.reviews,
    orderItemId,
    initialRating,
    initialText,
    policy: REVIEW_FORM_POLICY,
    messages: { ratingRequired: t("reviews.form.ratingRequired"), failed: t("reviews.form.failed") },
    onDone,
  });

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    void submit();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <div>
        <p id={`${id}-rating`} className="eyebrow mb-1 text-[11px]">
          {t("reviews.form.rating")}
        </p>
        <StarInput value={rating} onChange={setRating} labelId={`${id}-rating`} />
      </div>
      <div>
        <label htmlFor={`${id}-text`} className="eyebrow mb-1 block text-[11px]">
          {t("reviews.form.text")}
        </label>
        <textarea
          id={`${id}-text`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t("reviews.form.placeholder")}
          maxLength={REVIEW_MAX}
          rows={4}
          aria-describedby={`${id}-hint`}
          className="w-full resize-y rounded-[var(--r)] border border-[var(--line-strong)] bg-[var(--surface-2)] px-3 py-2.5 text-[14px] text-[var(--ink)] outline-none transition-colors focus:border-[var(--accent)]"
        />
        <p id={`${id}-hint`} className="mt-1 flex justify-between gap-3 text-[12px] font-medium">
          <span className={len > 0 && len < REVIEW_MIN_LENGTH ? "text-[var(--warn)]" : "text-[var(--faint)]"}>
            {t("reviews.form.minHint", { n: REVIEW_MIN_LENGTH })}
          </span>
          <span className="tabular-nums text-[var(--faint)]">
            {len}/{REVIEW_MAX}
          </span>
        </p>
      </div>
      {err && (
        <p role="alert" className="text-[13px] font-semibold text-[var(--danger)]">
          {err}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="accent" loading={busy} disabled={!canSubmit}>
          {edit ? t("reviews.form.save") : t("reviews.form.submit")}
        </Button>
        {onCancel && (
          <Button type="button" variant="surface" onClick={onCancel}>
            {t("common.cancel")}
          </Button>
        )}
      </div>
    </form>
  );
}
