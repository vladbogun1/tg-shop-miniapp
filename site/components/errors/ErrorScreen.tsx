"use client";

import Link from "next/link";
import { useI18n } from "@/i18n/context";

/** 404 / 500 in the neo style. */
export function ErrorScreen({ code, onRetry }: { code: 404 | 500; onRetry?: () => void }) {
  const { t, href } = useI18n();
  const title = code === 404 ? t("notFound.title") : t("error.title");
  const text = code === 404 ? t("notFound.text") : t("error.text");
  return (
    <div className="container-site flex justify-center pt-12 pb-6">
      <div className="nb-lg relative w-full max-w-2xl overflow-hidden p-8 text-center sm:p-12">
        <p
          aria-hidden
          className="text-[110px] font-black leading-none tracking-tighter text-[var(--accent)] [text-shadow:6px_6px_0_var(--shadow)] sm:text-[160px]"
        >
          {code}
        </p>
        <h1 className="mt-4 text-[26px] font-black uppercase tracking-tight text-[var(--ink)] sm:text-[32px]">{title}</h1>
        <p className="mx-auto mt-3 max-w-md text-[15px] font-semibold text-[var(--muted)]">{text}</p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          {onRetry && (
            <button type="button" onClick={onRetry} className="nb-accent nb-press tap nb-up px-5 py-3 text-[14px]">
              {t("common.retry")}
            </button>
          )}
          <Link href={href("/")} className="nb nb-hover tap nb-up px-5 py-3 text-[14px] font-extrabold text-[var(--ink)]">
            {t("common.toHome")}
          </Link>
          <Link href={href("/catalog")} className="nb nb-hover tap nb-up bg-[var(--c3)] px-5 py-3 text-[14px] font-extrabold text-[var(--accent-ink)]">
            {t("common.toCatalog")}
          </Link>
        </div>
      </div>
    </div>
  );
}
