"use client";

import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { Button } from "@shop/ui/primitives";
import { useT } from "@/i18n/context";
import { spring } from "@/lib/motion";

/**
 * Bottom action bar — Назад + Далее/Оформить. FIXED, not sticky: a sticky bar only pins once the
 * page is long enough to scroll past it, so on a short step (and now that the tab bar is hidden
 * during checkout) it used to come to rest halfway up the screen.
 */
export function CheckoutBottomBar({
  step,
  keyboardOpen,
  submitting,
  stepOk,
  primaryLabel,
  onBack,
  onNext,
}: {
  step: number;
  keyboardOpen: boolean;
  submitting: boolean;
  stepOk: boolean;
  primaryLabel: string;
  onBack: () => void;
  onNext: () => void;
}) {
  const t = useT();
  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-30 mx-auto w-full max-w-[480px]"
      style={{ bottom: "calc(var(--tabbar-h) + var(--safe-bottom) + 12px)" }}
    >
      {/* Out of the way while the keyboard is up (as in the cart): on Android the webview shrinks
          and the bar would sit right over the city / branch suggestions. */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: keyboardOpen ? 0 : 1, y: keyboardOpen ? 24 : 0 }}
        style={{ pointerEvents: keyboardOpen ? "none" : undefined }}
        transition={spring}
        className="pointer-events-auto mx-4 flex items-center gap-3 rounded-[16px] border border-[var(--line-strong)] bg-[rgba(26,26,26,.94)] p-3 shadow-[0_18px_40px_-12px_rgba(0,0,0,.8)] backdrop-blur-[12px]"
      >
        {step > 0 && (
          <Button variant="surface" onClick={onBack}>
            {t("common.back")}
          </Button>
        )}
        <Button
          variant="accent"
          fullWidth
          className="flex-1"
          loading={submitting}
          disabled={!stepOk}
          icon={step < 3 ? <ArrowRight className="h-4 w-4" /> : undefined}
          onClick={onNext}
        >
          {primaryLabel}
        </Button>
      </motion.div>
    </div>
  );
}
