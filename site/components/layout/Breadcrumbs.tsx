import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { localePath, makeT } from "@/i18n";
import type { Locale } from "@/i18n/locales";

export interface Crumb {
  label: string;
  /** Site path WITHOUT locale prefix; omitted for the current page. */
  path?: string;
}

/** Visible breadcrumbs (server component). "Home" is prepended automatically. */
export function Breadcrumbs({ locale, items }: { locale: Locale; items: Crumb[] }) {
  const t = makeT(locale);
  const all: Crumb[] = [{ label: t("breadcrumbs.home"), path: "/" }, ...items];
  return (
    <nav aria-label={t("breadcrumbs.label")} className="mb-5">
      <ol className="flex flex-wrap items-center gap-1 text-[13px] font-bold text-[var(--muted)]">
        {all.map((c, i) => {
          const last = i === all.length - 1;
          return (
            <li key={i} className="flex min-w-0 items-center gap-1">
              {c.path && !last ? (
                <Link href={localePath(locale, c.path)} className="hover:text-[var(--ink)] hover:underline">
                  {c.label}
                </Link>
              ) : (
                <span aria-current={last ? "page" : undefined} className="truncate text-[var(--ink)]">
                  {c.label}
                </span>
              )}
              {!last && <ChevronRight className="h-3.5 w-3.5 shrink-0" strokeWidth={3} aria-hidden />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** schema.org BreadcrumbList for the same trail. */
export function breadcrumbJsonLd(locale: Locale, siteUrl: string, items: Crumb[], currentPath: string) {
  const t = makeT(locale);
  const all: Crumb[] = [{ label: t("breadcrumbs.home"), path: "/" }, ...items];
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: all.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.label,
      item: `${siteUrl}${localePath(locale, c.path ?? currentPath)}`,
    })),
  };
}

export function JsonLd({ data }: { data: unknown }) {
  return (
    <script
      type="application/ld+json"
      // JSON.stringify output with "<" escaped cannot break out of the script element.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}
