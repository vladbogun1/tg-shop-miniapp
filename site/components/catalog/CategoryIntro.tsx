import { ChevronDown } from "lucide-react";
import { makeT } from "@/i18n";
import type { Locale } from "@/i18n/locales";

/**
 * SEO text of a category (admin field `tags.intro_text`, translated like the name).
 *
 * OFF until the owner approves how it looks: the site must not change visually without that.
 * While {@link SHOW_CATEGORY_INTRO} is false the category page renders nothing extra, whatever the
 * admin has filled in. To turn it on, flip the constant — nothing else is needed.
 *
 * What it will look like: a card under the product grid (after the pagination), only on page 1 of
 * the category. Title = the page's H1, then the first paragraph; the rest is folded into a native
 * <details> («Читати повністю» / «Згорнути»), so it needs no client JS and the whole text is in
 * the HTML for search engines. Plain text: blank lines split paragraphs, single line breaks stay.
 */
export const SHOW_CATEGORY_INTRO = false;

export function CategoryIntro({ locale, title, text }: { locale: Locale; title: string; text: string }) {
  const t = makeT(locale);
  const paragraphs = text
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (paragraphs.length === 0) return null;
  const [first, ...rest] = paragraphs;

  return (
    <section aria-label={title} className="nb mt-12 p-5 sm:p-7">
      <h2 className="mb-3 font-display text-[18px] font-extrabold uppercase leading-tight tracking-[.02em] text-[var(--ink)] [overflow-wrap:anywhere] sm:text-[22px]">
        {title}
      </h2>
      <div className="max-w-[78ch] text-[15px] leading-relaxed text-[var(--muted)]">
        <Paragraph text={first} />
        {rest.length > 0 && (
          <details className="group mt-3">
            <summary className="link-ink inline-flex cursor-pointer list-none items-center gap-1.5 text-[14px] font-semibold [&::-webkit-details-marker]:hidden">
              <span className="group-open:hidden">{t("catalog.intro.more")}</span>
              <span className="hidden group-open:inline">{t("catalog.intro.less")}</span>
              <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" strokeWidth={2.5} aria-hidden />
            </summary>
            <div className="mt-3 flex flex-col gap-3">
              {rest.map((p, i) => (
                <Paragraph key={i} text={p} />
              ))}
            </div>
          </details>
        )}
      </div>
    </section>
  );
}

function Paragraph({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <p>
      {lines.map((line, i) => (
        <span key={i}>
          {i > 0 && <br />}
          {line}
        </span>
      ))}
    </p>
  );
}
