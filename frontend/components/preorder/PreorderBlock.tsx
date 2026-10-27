"use client";

/**
 * Pre-order pieces of the product page:
 *  - PreorderBlock: «Їде до нас» with the 3-step timeline, the term, «Чекають N людей», the shop's note
 *    — or, for an out-of-stock line without a batch, a short «повідомимо» note;
 *  - HoldBanner: «Заброньовано за вами до …» above the ordinary add-to-cart button;
 *  - PreorderCta: the button of the sticky bar («Повідомити…» / «Ви в черзі»).
 */
import { Bell, Check, Clock, Truck } from "lucide-react";
import { useI18n } from "@/i18n/context";
import { etaWhen, holdUntilText, type MyPreorder, type PreorderEta } from "@/lib/preorders";

/** Violet of the pre-order state (same as the «approved» order status). */
export const PRE_COLOR = "var(--st-approved)";

export function PreorderBlock({
  eta,
  waitingCount,
  mine,
  onEdit,
}: {
  /** The batch of the selected line; undefined = nothing is on its way (only the «notify me» note). */
  eta?: PreorderEta;
  waitingCount: number | null;
  mine?: MyPreorder;
  onEdit: () => void;
}) {
  const { t, tag } = useI18n();
  const when = etaWhen(eta, t, tag);
  const transit = eta?.stage === "in_transit";
  const steps = [
    { key: "ordered", label: t("preorder.step.ordered"), done: true },
    { key: "transit", label: t("preorder.step.transit"), done: transit },
    { key: "stock", label: t("preorder.step.stock"), done: false },
  ];

  return (
    <div className="nb mt-5 p-4" style={eta ? { borderColor: "color-mix(in srgb, var(--st-approved) 40%, transparent)" } : undefined}>
      <p className="font-display flex items-center gap-2 text-[15px] font-bold" style={{ color: eta ? PRE_COLOR : "var(--ink)" }}>
        {eta ? <Truck className="h-[18px] w-[18px] shrink-0" strokeWidth={2.25} /> : <Bell className="h-[18px] w-[18px] shrink-0 text-[var(--muted)]" strokeWidth={2.25} />}
        {eta ? t("preorder.block.title") : t("preorder.block.titleOut")}
      </p>

      {eta && (
        <ol className="mt-3 flex items-start" aria-label={t("preorder.block.title")}>
          {steps.map((s, i) => (
            <li key={s.key} className="relative flex min-w-0 flex-1 flex-col items-center gap-1.5 text-center">
              {i > 0 && (
                <span
                  aria-hidden
                  className="absolute right-1/2 top-[7px] h-[2px] w-full"
                  style={{ background: s.done ? PRE_COLOR : "var(--line-strong)" }}
                />
              )}
              <span
                aria-hidden
                className="relative z-10 h-4 w-4 rounded-full border-2"
                style={{ borderColor: s.done ? PRE_COLOR : "var(--line-strong)", background: s.done ? PRE_COLOR : "var(--surface)" }}
              />
              <span className="px-0.5 text-[11px] font-semibold leading-tight" style={{ color: s.done ? "var(--ink)" : "var(--faint)" }}>
                {s.label}
              </span>
            </li>
          ))}
        </ol>
      )}

      {when && (
        <p className="mt-3 flex items-center gap-1.5 text-[14px] font-semibold text-[var(--ink)]">
          <Clock className="h-4 w-4 shrink-0 text-[var(--muted)]" strokeWidth={2.25} />
          {t("preorder.expect", { d: when })}
        </p>
      )}
      {waitingCount != null && waitingCount > 0 && (
        <p className="mt-1.5 text-[13px] text-[var(--muted)]">{t("preorder.waiting", { n: waitingCount })}</p>
      )}
      {eta?.note && <p className="mt-2 text-[13px] italic leading-snug text-[#C9C9CF]">«{eta.note}»</p>}

      {mine ? (
        <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] font-semibold text-[var(--ok)]">
          <span className="inline-flex items-center gap-1.5">
            <Check className="h-4 w-4 shrink-0" strokeWidth={2.75} />
            {mine.position != null
              ? t("preorder.queued.line", { pos: mine.position, n: mine.qty })
              : t("preorder.queued.lineNoPos", { n: mine.qty })}
          </span>
          <button type="button" onClick={onEdit} className="tap font-medium text-[var(--muted)] underline underline-offset-2">
            {t("preorder.queued.change")}
          </button>
        </p>
      ) : (
        <p className="mt-3 text-[12px] leading-snug text-[var(--muted)]">{eta ? t("preorder.noPrepay") : t("preorder.outHint")}</p>
      )}
    </div>
  );
}

/** Banner over the add-to-cart button while a unit is held for me. */
export function HoldBanner({ hold }: { hold: MyPreorder }) {
  const { t, tag } = useI18n();
  return (
    <div className="mb-2.5 flex items-center gap-2 rounded-[var(--r)] border border-[color-mix(in_srgb,var(--ok)_45%,transparent)] bg-[color-mix(in_srgb,var(--ok)_10%,transparent)] px-3 py-2 text-[12.5px] font-semibold leading-snug text-[var(--ok)]">
      <Clock className="h-4 w-4 shrink-0" strokeWidth={2.5} />
      <span className="min-w-0">{t("preorder.held.title", { t: holdUntilText(hold.holdUntil!, tag) })}</span>
    </div>
  );
}

/** Sticky-bar button of a line that cannot be bought now. */
export function PreorderCta({
  hasEta,
  queued,
  onClick,
}: {
  hasEta: boolean;
  queued: boolean;
  onClick: () => void;
}) {
  const { t } = useI18n();
  if (queued) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="nb-press tap font-display inline-flex h-12 w-full items-center justify-center gap-2 rounded-[var(--r)] border border-[var(--line-strong)] bg-[var(--surface-2)] px-4 text-[14px] font-bold uppercase tracking-[0.06em] text-[var(--ok)]"
      >
        <Check className="h-4 w-4 shrink-0" strokeWidth={2.75} />
        <span className="truncate">{t("preorder.cta.queued")}</span>
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="nb-press tap font-display inline-flex h-12 w-full items-center justify-center gap-2 rounded-[var(--r)] border-2 px-4 text-[14px] font-bold uppercase tracking-[0.06em]"
      style={{ borderColor: hasEta ? PRE_COLOR : "var(--line-strong)", color: hasEta ? PRE_COLOR : "var(--ink)" }}
    >
      <Bell className="h-4 w-4 shrink-0" strokeWidth={2.5} />
      <span className="truncate">{hasEta ? t("preorder.cta.notify") : t("preorder.cta.notifyOut")}</span>
    </button>
  );
}
