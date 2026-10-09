import { Send } from "lucide-react";
import Link from "next/link";
import type { Locale } from "@shop/shared";
import type { MenuNode } from "@/lib/category-tree";
import { localePath, makeT } from "@/i18n";
import { Wordmark } from "@/components/layout/Logo";
import { BOT_URL } from "@/lib/config";
import { SupportGate } from "@/components/support/SupportGate";
import { FooterSweeper } from "@/components/mascot/scenes";

/**
 * Site footer (server component): shop links, customer info pages, Telegram, seller requisites.
 * `.chrome` surface a step darker than the page, hairline on top, Exo 2 eyebrow headings.
 */
export function Footer({ tree, locale }: { tree: MenuNode[]; locale: Locale }) {
  const t = makeT(locale);
  const href = (p: string) => localePath(locale, p);
  const year = new Date().getFullYear();
  const linkCls = "text-[14px] font-medium text-[var(--muted)] transition-colors hover:text-[var(--accent-hi)]";

  return (
    <footer className="chrome relative z-10 mt-20 border-t border-[var(--line)]">
      <span aria-hidden className="absolute left-0 top-[-1px] h-[2px] w-24 bg-[var(--accent)] shadow-[0_0_10px_rgba(255,102,0,.7)] sm:left-[max(24px,calc((100vw-1280px)/2+24px))]" />
      <FooterSweeper />
      <div className="container-site grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <Wordmark size={28} />
          <p className="eyebrow mt-2 text-[10px]">{t("brand.tagline")}</p>
          <p className="mt-4 max-w-xs text-[14px] leading-relaxed text-[var(--muted)]">{t("meta.description")}</p>
        </div>

        <nav aria-label={t("footer.shop")}>
          <p className="eyebrow mb-4 text-[var(--ink)]">{t("footer.shop")}</p>
          <ul className="flex flex-col gap-2">
            <li>
              <Link href={href("/catalog")} className={linkCls}>
                {t("header.allProducts")}
              </Link>
            </li>
            {tree.slice(0, 12).map((c) => (
              <li key={c.id}>
                <Link href={href(`/catalog/${c.slug}`)} className={linkCls}>
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-label={t("footer.customers")}>
          <p className="eyebrow mb-4 text-[var(--ink)]">{t("footer.customers")}</p>
          <ul className="flex flex-col gap-2">
            {(
              [
                ["/delivery", "info.delivery"],
                ["/returns", "info.returns"],
                ["/warranty", "info.warranty"],
                ["/privacy", "info.privacy"],
                ["/terms", "info.terms"],
                ["/about", "info.about"],
                ["/contacts", "info.contacts"],
                ["/account", "header.account"],
              ] as const
            ).map(([p, k]) => (
              <li key={p}>
                <Link href={href(p)} className={linkCls}>
                  {t(k)}
                </Link>
              </li>
            ))}
            <SupportGate>
              <li>
                <Link href={href("/account/support")} className={linkCls}>
                  {t("support.nav")}
                </Link>
              </li>
            </SupportGate>
          </ul>
        </nav>

        <div>
          <p className="eyebrow mb-4 text-[var(--ink)]">{t("footer.contact")}</p>
          <a
            href={BOT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center gap-2 rounded-[var(--r)] border border-[var(--accent)] bg-[var(--accent-soft)] px-4 py-2.5 font-display text-[13px] font-bold uppercase tracking-[.08em] text-[var(--accent-hi)] transition-colors hover:bg-[rgba(255,102,0,.2)] hover:text-[var(--ink)]"
          >
            <Send className="h-4 w-4" strokeWidth={2.25} />
            {t("footer.bot")}
          </a>
          <p className="mt-3 text-[13px] leading-relaxed text-[var(--muted)]">{t("footer.botText")}</p>
        </div>
      </div>
      <div className="border-t border-[var(--line)]">
        <div className="container-site flex flex-col gap-1 py-4 text-[12px] text-[var(--faint)] sm:flex-row sm:justify-between">
          <span>{t("footer.requisites")}</span>
          <span>
            {t("footer.trademarks")} {t("footer.rights", { year })}
          </span>
        </div>
      </div>
    </footer>
  );
}
