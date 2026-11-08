import { ChevronDown } from "lucide-react";
import { makeT } from "@/i18n";
import type { Locale } from "@shop/core/i18n";
import { introBlocks, type IntroBlock } from "../model/intro-blocks";

/**
 * SEO text of a category (admin field `tags.intro_text`, translated like the name).
 *
 * A card under the product grid (after the pagination), only on page 1 of the category. Title = the
 * page's H1, then the first block; the rest is folded into a native <details> («Читати повністю» /
 * «Згорнути»), so it needs no client JS and the whole text is in the HTML for search engines.
 * Plain text from the admin: headings and FAQ items are recognised by {@link introBlocks}.
 *
 * {@link SHOW_CATEGORY_INTRO} is the kill switch: false = the category page renders nothing extra,
 * whatever the admin has filled in. Turned on 09.11.2026 after the owner approved the look.
 */
export const SHOW_CATEGORY_INTRO = true;

export function CategoryIntro({ locale, title, text }: { locale: Locale; title: string; text: string }) {
  const t = makeT(locale);
  const blocks = introBlocks(text);
  if (blocks.length === 0) return null;
  const [first, ...rest] = blocks;

  return (
    <section aria-label={title} className="nb mt-12 p-5 sm:p-7">
      <h2 className="mb-3 font-display text-[18px] font-extrabold uppercase leading-tight tracking-[.02em] text-[var(--ink)] [overflow-wrap:anywhere] sm:text-[22px]">
        {title}
      </h2>
      <div className="max-w-[78ch] text-[15px] leading-relaxed text-[var(--muted)] [overflow-wrap:anywhere]">
        <Block block={first} />
        {rest.length > 0 && (
          <details className="group mt-3">
            <summary className="link-ink inline-flex cursor-pointer list-none items-center gap-1.5 text-[14px] font-semibold [&::-webkit-details-marker]:hidden">
              <span className="group-open:hidden">{t("catalog.intro.more")}</span>
              <span className="hidden group-open:inline">{t("catalog.intro.less")}</span>
              <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" strokeWidth={2.5} aria-hidden />
            </summary>
            <div className="mt-3 flex flex-col gap-3">
              {rest.map((b, i) => (
                <Block key={i} block={b} />
              ))}
            </div>
          </details>
        )}
      </div>
    </section>
  );
}

function Block({ block }: { block: IntroBlock }) {
  if (block.kind === "heading") {
    return <h3 className="mt-2 text-[16px] font-extrabold leading-snug text-[var(--ink)]">{block.text}</h3>;
  }
  if (block.kind === "qa") {
    return (
      <p>
        <strong className="font-bold text-[var(--ink)]">{block.question}</strong>
        <Lines lines={block.answer} leadingBreak />
      </p>
    );
  }
  return (
    <p>
      <Lines lines={block.lines} />
    </p>
  );
}

function Lines({ lines, leadingBreak = false }: { lines: string[]; leadingBreak?: boolean }) {
  return (
    <>
      {lines.map((line, i) => (
        <span key={i}>
          {(i > 0 || leadingBreak) && <br />}
          {line}
        </span>
      ))}
    </>
  );
}
