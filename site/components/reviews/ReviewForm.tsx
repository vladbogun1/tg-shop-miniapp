"use client";

/**
 * Review form for one order line: stars + text with a counter. Creates the review, or re-submits it
 * while it is still PENDING (same orderItemId). Server refusals (400) arrive already localized.
 */
import { useId, useState } from "react";
import type { SubmitReviewResult } from "@shop/shared";
import { Button } from "@/components/ui/Button";
import { useI18n } from "@/i18n/context";
import { api, ApiError } from "@/lib/api";
import { StarInput } from "./StarInput";

/** Defaults of the backend (`reviews.minLength`, ReviewRules.MAX_TEXT); the server has the final word. */
export const REVIEW_MIN = 10;
export const REVIEW_MAX = 4000;

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
  const [rating, setRating] = useState(initialRating);
  const [text, setText] = useState(initialText);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const len = [...text.trim()].length;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!rating) {
      setErr(t("reviews.form.ratingRequired"));
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const res = await api.submitReview({ orderItemId, rating, text: text.trim() });
      onDone(res);
    } catch (e2) {
      setErr(e2 instanceof ApiError ? e2.message : t("reviews.form.failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-3">
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
          <span className={len > 0 && len < REVIEW_MIN ? "text-[var(--warn)]" : "text-[var(--faint)]"}>
            {t("reviews.form.minHint", { n: REVIEW_MIN })}
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
        <Button type="submit" variant="accent" loading={busy} disabled={busy}>
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
