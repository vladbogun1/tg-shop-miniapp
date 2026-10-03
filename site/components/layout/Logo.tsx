"use client";

import Link from "next/link";
import { useI18n } from "@/i18n/context";

/** Wordmark: heavy uppercase type on an accent block, the neo way. */
export function Logo() {
  const { t, href } = useI18n();
  return (
    <Link
      href={href("/")}
      aria-label={t("header.home")}
      className="group inline-flex shrink-0 items-center"
    >
      <span className="rounded-[var(--r)] border-[3px] border-[var(--line)] bg-[var(--ink)] px-2 py-1 text-[17px] font-black uppercase leading-none tracking-tight text-[var(--bg)] shadow-[3px_3px_0_var(--accent)] transition-transform group-hover:-translate-x-[1px] group-hover:-translate-y-[1px] sm:text-[20px]">
        MAX<span className="text-[var(--accent)]">SOLCH</span>
      </span>
    </Link>
  );
}
