"use client";

import Link from "next/link";
import { buttonClass } from "@/components/ui/button-styles";
import { useI18n } from "@/i18n/context";
import { NotFoundScene } from "@/components/mascot/scenes";

/** 404 / 500: big glowing code in a HUD frame. */
export function ErrorScreen({ code, onRetry }: { code: 404 | 500; onRetry?: () => void }) {
  const { t, href } = useI18n();
  const title = code === 404 ? t("notFound.title") : t("error.title");
  const text = code === 404 ? t("notFound.text") : t("error.text");
  return (
    <div className="container-site flex justify-center pt-12 pb-6">
      <div className="nb-lg hud-frame relative w-full max-w-2xl p-8 text-center sm:p-12">
        {code === 404 && <NotFoundScene />}
        <p
          aria-hidden
          className="font-display text-[110px] font-extrabold italic leading-none tracking-[-.02em] text-[var(--accent)] [text-shadow:0_0_40px_rgba(255,102,0,.45)] sm:text-[160px]"
        >
          {code}
        </p>
        <h1 className="mt-4 font-display text-[26px] font-extrabold uppercase tracking-[.02em] text-[var(--ink)] sm:text-[32px]">{title}</h1>
        <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-[var(--muted)]">{text}</p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          {onRetry && (
            <button type="button" onClick={onRetry} className={buttonClass("accent")}>
              {t("common.retry")}
            </button>
          )}
          <Link href={href("/")} className={buttonClass("surface")}>
            {t("common.toHome")}
          </Link>
          <Link href={href("/catalog")} className={buttonClass(onRetry ? "surface" : "accent")}>
            {t("common.toCatalog")}
          </Link>
        </div>
      </div>
    </div>
  );
}
