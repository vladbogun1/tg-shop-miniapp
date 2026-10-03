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
      <ul className="flex items-center rounded-[var(--r)] border-[3px] border-[var(--line)] bg-[var(--surface)]">
        {LOCALES.map((l, i) => {
          const target = localePath(l, pathname);
          const active = l === locale;
          return (
            <li key={l} className={i > 0 ? "border-l-[2.5px] border-[var(--line)]" : ""}>
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
                className={`grid h-[38px] min-w-[40px] place-items-center px-2 text-[12px] font-black tracking-wide transition-colors ${
                  active
                    ? "bg-[var(--ink)] text-[var(--bg)]"
                    : "text-[var(--ink)] hover:bg-[var(--surface-2)]"
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
