"use client";

/**
 * Crash screen for the customer app.
 *
 * Without this, a client-side exception falls through to Next's built-in
 * "Application error: a client-side exception has occurred" — in English, in every language, with
 * no way back into the shop. This at least speaks the customer's language and offers the catalogue.
 */
import { TriangleAlert } from "lucide-react";
import { useEffect } from "react";
import { Logo } from "@/components/Logo";
import { useT } from "@/i18n/context";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const t = useT();

  return (
    <div className="pt-2">
      <div className="mt-6 flex justify-center">
        <Logo size="md" variant="full" />
      </div>
      <div className="nb-lg hud-frame mt-8 flex flex-col items-center gap-4 px-6 py-14 text-center">
        <span
          className="grid h-14 w-14 place-items-center rounded-[var(--r-card)] border border-[var(--line-strong)] bg-[var(--surface-2)] text-[var(--accent)]"
          aria-hidden
        >
          <TriangleAlert className="h-7 w-7" strokeWidth={2.25} />
        </span>
        <h1 className="nb-up text-[18px] font-extrabold text-[var(--ink)]">
          {t("error.title")}
        </h1>
        <p className="max-w-[280px] text-[13px] leading-relaxed text-[var(--muted)]">
          {t("error.text")}
        </p>
        <button
          type="button"
          onClick={reset}
          className="tap nb-accent nb-press nb-up mt-1 px-5 py-2.5 text-[14px]"
        >
          {t("common.retry")}
        </button>
      </div>
    </div>
  );
}
