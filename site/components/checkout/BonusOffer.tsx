"use client";

/**
 * "You have a review bonus" — offered above the empty promo field.
 *
 * The bonus used to live only in the bot DM and on the reviews page, so it was easy to place the
 * next order and forget it. It is not applied by itself (a single-use code may be worth more on a
 * bigger order); one tap puts it into the field, where it is checked and held like any other code.
 */
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Gift } from "lucide-react";
import { BONUS_EXPIRING_DAYS, pickBonusOffer, type BonusCode } from "@shop/shared";
import { useT } from "@/i18n/context";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { useFmt } from "@/lib/use-fmt";

/** My review bonuses; empty until signed in, and a failed load just means no offer. */
export function useMyBonuses(): BonusCode[] {
  const session = useSession();
  const q = useQuery({
    // Same key as the account's "My bonuses", so a code used there is not offered here.
    queryKey: ["me", "bonuses"],
    queryFn: () => api.myBonuses(),
    enabled: session.status === "authed",
    staleTime: 60_000,
  });
  return q.data ?? [];
}

export function BonusOffer({
  bonuses,
  visible,
  onApply,
}: {
  bonuses: BonusCode[];
  /** Only while the field is empty — codes do not stack. */
  visible: boolean;
  onApply: (code: string) => void;
}) {
  const t = useT();
  const fmt = useFmt();
  const offer = pickBonusOffer(bonuses);
  const show = visible && offer != null;

  // Validity, "runs out soon" and "more in the profile" — each kept whole when the line wraps.
  const meta: { text: string; accent?: boolean }[] = [];
  if (offer?.bonus.expiresAt) {
    meta.push({ text: t("promo.bonus.until", { date: fmt.dayMonth(offer.bonus.expiresAt) }) });
  }
  if (offer?.daysLeft != null && offer.daysLeft <= BONUS_EXPIRING_DAYS) {
    meta.push({
      text: offer.daysLeft === 1 ? t("promo.bonus.expiresToday") : t("promo.bonus.expiresIn", { n: offer.daysLeft }),
      accent: true,
    });
  }
  if (offer && offer.more > 0) meta.push({ text: t("promo.bonus.more", { n: offer.more }) });

  return (
    <AnimatePresence initial={false}>
      {show && offer && (
        <motion.div
          key={offer.bonus.code}
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          className="overflow-hidden"
        >
          <div className="mb-2.5 rounded-[var(--r-card)] border border-dashed border-[color-mix(in_srgb,var(--accent)_60%,transparent)] bg-[var(--accent-soft)] px-3.5 py-3">
            <div className="flex items-center gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[color-mix(in_srgb,var(--accent)_22%,transparent)]">
                <Gift className="h-[18px] w-[18px] text-[var(--accent)]" strokeWidth={2.25} aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-display text-[14px] font-bold leading-tight text-[var(--ink)]">
                  {t("promo.bonus.title", { n: offer.bonus.percent })}
                </p>
                <p className="font-display mt-0.5 truncate text-[12px] font-semibold tracking-[0.06em] text-[var(--muted)]">
                  {offer.bonus.code}
                </p>
              </div>
              <motion.button
                type="button"
                whileTap={{ scale: 0.94 }}
                onClick={() => {
                  onApply(offer.bonus.code);
                }}
                className="tap shrink-0 rounded-[var(--r)] bg-[var(--accent)] px-3.5 py-2 text-[13px] font-bold text-[var(--accent-ink)]"
              >
                {t("promo.bonus.apply")}
              </motion.button>
            </div>
            {meta.length > 0 && (
              <p className="mt-2 pl-12 text-[11.5px] font-medium leading-snug text-[var(--muted)]">
                {meta.map((m, i) => (
                  <span
                    key={m.text}
                    className={`whitespace-nowrap ${m.accent ? "font-semibold text-[var(--accent)]" : ""}`}
                  >
                    {i > 0 && " · "}
                    {m.text}
                  </span>
                ))}
              </p>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
