import { Send } from "lucide-react";
import Link from "next/link";
import type { PublicCategory } from "@shop/shared";
import { localePath, makeT } from "@/i18n";
import type { Locale } from "@/i18n/locales";
import { BOT_URL } from "@/lib/config";

/**
 * Site footer (server component): shop links, customer info pages, Telegram, seller requisites.
 * Same `.chrome` surface as the header, so the page is framed by one colour in both themes (it used
 * to be `--ink`, which turned into a cream slab in the dark theme).
 */
export function Footer({ categories, locale }: { categories: PublicCategory[]; locale: Locale }) {
  const t = makeT(locale);
  const href = (p: string) => localePath(locale, p);
  const year = new Date().getFullYear();
  const linkCls = "text-[14px] font-semibold text-[var(--ink)] opacity-85 hover:opacity-100 hover:text-[var(--c3)]";

  return (
    <footer className="chrome relative z-10 mt-16 border-t-[3px] border-[var(--chrome-edge)]">
      <div className="container-site grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="text-[22px] font-black uppercase tracking-tight text-[#FFFDF6]">
            MAX<span className="text-[var(--accent)]">SOLCH</span>
          </p>
          <p className="mt-3 max-w-xs text-[14px] font-medium opacity-80">{t("meta.description")}</p>
        </div>

        <nav aria-label={t("footer.shop")}>
          <p className="nb-up mb-3 text-[12px] font-black text-[var(--c3)]">{t("footer.shop")}</p>
          <ul className="flex flex-col gap-2">
            <li>
              <Link href={href("/catalog")} className={linkCls}>
                {t("header.allProducts")}
              </Link>
            </li>
            {categories.slice(0, 8).map((c) => (
              <li key={c.id}>
                <Link href={href(`/catalog/${c.slug}`)} className={linkCls}>
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-label={t("footer.customers")}>
          <p className="nb-up mb-3 text-[12px] font-black text-[var(--c3)]">{t("footer.customers")}</p>
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
          </ul>
        </nav>

        <div>
          <p className="nb-up mb-3 text-[12px] font-black text-[var(--c3)]">{t("footer.contact")}</p>
          <a
            href={BOT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-[var(--r)] border-[3px] border-[var(--line)] bg-[var(--c2)] px-4 py-2.5 text-[13px] font-black uppercase tracking-wide text-white shadow-[4px_4px_0_var(--accent)] transition-transform hover:-translate-x-[1px] hover:-translate-y-[1px]"
          >
            <Send className="h-4 w-4" strokeWidth={2.75} />
            {t("footer.bot")}
          </a>
          <p className="mt-3 text-[13px] font-medium opacity-80">{t("footer.botText")}</p>
        </div>
      </div>
      <div className="border-t-[2px] border-[color-mix(in_srgb,var(--ink)_25%,transparent)]">
        <div className="container-site flex flex-col gap-1 py-4 text-[12px] font-semibold opacity-75 sm:flex-row sm:justify-between">
          <span>{t("footer.requisites")}</span>
          <span>{t("footer.rights", { year })}</span>
        </div>
      </div>
    </footer>
  );
}
