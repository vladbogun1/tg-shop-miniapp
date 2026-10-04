"use client";

/**
 * UA · RU · EN — letters, never flags (a flag is a country, not a language). Each option is a real
 * link to the same page under the other prefix, so it works without JavaScript and search engines
 * see the alternates; with JavaScript the current query string is carried over.
 */
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { localePath, stripLocale } from "@/i18n";
import { useI18n } from "@/i18n/context";
import { LOCALE_NAME, LOCALE_SHORT, LOCALES } from "@/i18n/locales";

export function LangSwitch() {
  const { locale, t } = useI18n();
  const pathname = stripLocale(usePathname() ?? "/");
  const router = useRouter();
  return (
    <nav aria-label={t("header.lang")}>
      <ul className="inline-flex items-center gap-1 rounded-full border border-[var(--line)] bg-[var(--surface)] p-1">
        {LOCALES.map((l) => {
          const target = localePath(l, pathname);
          const active = l === locale;
          return (
            <li key={l}>
              <Link
                href={target}
                hrefLang={l}
                lang={l}
                title={LOCALE_NAME[l]}
                aria-current={active ? "true" : undefined}
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey || e.shiftKey) return;
                  e.preventDefault();
                  router.push(target + window.location.search);
                }}
                className={`grid h-[34px] min-w-[42px] place-items-center rounded-full border px-2 font-display text-[12px] font-bold tracking-[.08em] transition-colors ${
                  active
                    ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-hi)]"
                    : "border-transparent text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
                }`}
              >
                {LOCALE_SHORT[l]}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
