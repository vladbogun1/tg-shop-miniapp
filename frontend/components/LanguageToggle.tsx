"use client";

/**
 * Language switch — a compact chip in the catalog header.
 *
 * Two design decisions worth keeping:
 *
 *  - **Letters, never flags.** A flag is a country, not a language, and for a Ukrainian shop that
 *    distinction is not academic.
 *  - **Each language is written in itself** in the sheet ("Українська", not "украинский"). If the
 *    app opened in a language you cannot read, a list in that same language is no help at all.
 *
 * Tapping opens a small sheet rather than cycling: cycling through three options means tapping the
 * wrong one twice before landing on yours.
 */
import { AnimatePresence, motion } from "framer-motion";
import { Check, Globe } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "@/i18n/context";
import { LOCALES, LOCALE_NAME, LOCALE_SHORT, type Locale } from "@/i18n/locales";
import { backdrop, sheetVariants } from "@/lib/motion";
import { haptic } from "@/lib/telegram";

export function LanguageToggle() {
  const { locale, setLocale, t } = useI18n();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  function choose(next: Locale) {
    haptic();
    setOpen(false);
    if (next !== locale) setLocale(next);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          haptic();
          setOpen(true);
        }}
        aria-label={t("lang.switch")}
        className="nb-press tap grid h-11 w-11 shrink-0 place-items-center rounded-[var(--r)] border border-[var(--line)] bg-[var(--surface-2)] text-[var(--ink)] hover:border-[var(--line-strong)]"
      >
        <span className="font-display text-[13px] font-bold leading-none tracking-[0.04em]">{LOCALE_SHORT[locale]}</span>
      </button>

      {mounted &&
        createPortal(
          <AnimatePresence>
            {open && (
              <motion.div
                variants={backdrop}
                initial="initial"
                animate="animate"
                exit="exit"
                onClick={() => setOpen(false)}
                className="fixed inset-0 z-[1300] flex items-end justify-center bg-black/60 backdrop-blur-[6px]"
              >
                <motion.div
                  variants={sheetVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  onClick={(e) => e.stopPropagation()}
                  className="nb-lg mx-3 mb-3 w-full max-w-[456px] rounded-[16px] border-[var(--line-strong)] p-3"
                  style={{ marginBottom: "calc(12px + var(--safe-bottom))" }}
                >
                  <h2 className="eyebrow mb-3 flex items-center gap-2 px-1 pt-1">
                    <Globe className="h-4 w-4" strokeWidth={2.25} />
                    {t("lang.title")}
                  </h2>

                  <div className="flex flex-col gap-2">
                    {LOCALES.map((code) => {
                      const on = code === locale;
                      return (
                        <button
                          key={code}
                          type="button"
                          onClick={() => choose(code)}
                          lang={code}
                          className={`tap flex items-center gap-3 rounded-[var(--r)] border px-3 py-3 text-left text-[15px] font-semibold transition-[transform,background-color,border-color] active:scale-[.98] ${
                            on
                              ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-hi)]"
                              : "border-[var(--line)] bg-[var(--surface-2)] text-[var(--ink)]"
                          }`}
                        >
                          <span className="font-display w-8 shrink-0 text-[12px] font-bold opacity-70">
                            {LOCALE_SHORT[code]}
                          </span>
                          <span className="flex-1">{LOCALE_NAME[code]}</span>
                          {on && <Check className="h-5 w-5 shrink-0" strokeWidth={2.5} />}
                        </button>
                      );
                    })}
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </>
  );
}

/**
 * The same setting, spelled out as a row of segments for the account screen.
 *
 * The header chip is for the person who notices the app is in the wrong language immediately; this
 * one is for the person who goes looking for the setting where settings normally live.
 */
export function LanguageSegments() {
  const { locale, setLocale, t } = useI18n();

  return (
    <div className="nb p-3">
      <h2 className="eyebrow mb-2.5 flex items-center gap-2 px-0.5">
        <Globe className="h-4 w-4" strokeWidth={2.25} />
        {t("lang.title")}
      </h2>
      <div className="flex gap-2">
        {LOCALES.map((code) => {
          const on = code === locale;
          return (
            <button
              key={code}
              type="button"
              lang={code}
              onClick={() => {
                haptic();
                if (code !== locale) setLocale(code);
              }}
              className={`font-display tap min-h-0 flex-1 rounded-[var(--r)] border px-2 py-2 text-[13px] font-semibold transition-[transform,background-color,border-color] active:scale-[.98] ${
                on
                  ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-hi)]"
                  : "border-[var(--line)] bg-[var(--surface-2)] text-[var(--ink)]"
              }`}
            >
              {LOCALE_NAME[code]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
