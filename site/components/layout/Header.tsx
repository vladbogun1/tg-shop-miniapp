"use client";

/**
 * Sticky site header, laid out like vinli.com.ua: logo · catalogue · search with live suggestions ·
 * language · account · cart. Header and footer share one "chrome" surface (globals.css `.chrome`) in
 * both themes. Categories live on the home page, in the catalogue sidebar and in the burger sheet —
 * there is no second category row any more. On phones the search drops to its own row.
 *
 * The theme switch moved to /account/settings; its slot is kept empty on purpose so the controls
 * to its right stay exactly where customers learned them.
 */
import { AnimatePresence, motion } from "framer-motion";
import { LayoutGrid, Menu, ShoppingBag, User, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { PublicCategory } from "@shop/shared";
import { stripLocale } from "@/i18n";
import { useI18n } from "@/i18n/context";
import { useCart, useCartCount } from "@/lib/cart";
import { useEscape, useHydrated, useScrollLock } from "@/lib/hooks";
import { noFadeFlash } from "@/lib/motion";
import { displayName, initials, rememberedUser, useSession } from "@/lib/session";
import { LangMenu } from "./LangMenu";
import { LangSwitch } from "./LangSwitch";
import { Logo } from "./Logo";
import { SearchBox } from "./SearchBox";

export function Header({ categories }: { categories: PublicCategory[] }) {
  const { t, href } = useI18n();
  const pathname = stripLocale(usePathname() ?? "/");
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = useCallback(() => setMenuOpen(false), []);

  // Any navigation closes the burger sheet.
  useEffect(() => setMenuOpen(false), [pathname]);

  const activeSlug = pathname.startsWith("/catalog/") ? decodeURIComponent(pathname.split("/")[2] ?? "") : null;

  return (
    <header className="chrome sticky top-0 z-40 border-b-[3px] border-[var(--chrome-edge)]">
      <a href="#main" className="skip-link nb px-3 py-2 text-[13px] font-extrabold uppercase">
        {t("header.skip")}
      </a>
      <div className="container-site flex h-[var(--header-h)] items-center gap-2 md:gap-3">
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          aria-label={t("header.menu")}
          aria-expanded={menuOpen}
          className="nb-flat tap grid h-11 w-11 shrink-0 place-items-center text-[var(--ink)] lg:hidden"
        >
          <Menu className="h-5 w-5" strokeWidth={2.75} />
        </button>
        <Logo />
        <Link
          href={href("/catalog")}
          aria-current={pathname === "/catalog" || activeSlug ? "page" : undefined}
          className="nb nb-hover ml-2 hidden h-11 shrink-0 items-center gap-2 px-4 text-[13px] font-black uppercase tracking-wide text-[var(--accent-ink)] lg:inline-flex"
          // Inline: `.nb` sets its own background and would win over a utility class.
          style={{ background: "var(--c3)" }}
        >
          <LayoutGrid className="h-4 w-4" strokeWidth={2.75} />
          {t("header.catalog")}
        </Link>
        <div className="mx-1 hidden min-w-0 flex-1 md:block">
          <SearchBox />
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2 md:ml-0">
          <div className="hidden sm:block">
            <LangMenu />
          </div>
          {/* Where the theme switch was (now in /account/settings): an empty slot of the same width. */}
          <span aria-hidden className="hidden h-11 w-11 shrink-0 lg:block" />
          <AccountButton />
          <CartButton />
        </div>
      </div>

      {/* phone: search on its own row */}
      <div className="container-site pb-3 md:hidden">
        <SearchBox />
      </div>

      <MobileMenu open={menuOpen} onClose={closeMenu} categories={categories} activeSlug={activeSlug} />
    </header>
  );
}

function CartButton() {
  const { t } = useI18n();
  const hydrated = useHydrated();
  const count = useCartCount();
  const open = useCart((s) => s.openDrawer);
  const shown = hydrated ? count : 0;
  return (
    <button
      type="button"
      onClick={open}
      aria-label={shown > 0 ? t("header.cartCount", { n: shown }) : t("header.cart")}
      className="nb nb-hover tap relative grid h-11 w-11 shrink-0 place-items-center text-[var(--accent-ink)] xl:w-auto xl:grid-flow-col xl:gap-2 xl:px-4"
      style={{ background: "var(--accent)" }}
    >
      <ShoppingBag className="h-5 w-5" strokeWidth={2.75} />
      <span className="hidden text-[13px] font-black uppercase tracking-wide xl:inline">{t("header.cart")}</span>
      {shown > 0 && (
        <span className="absolute -right-2 -top-2 grid h-6 min-w-6 place-items-center rounded-[var(--r)] border-[2.5px] border-[var(--line)] bg-[var(--c3)] px-1 text-[11px] font-black text-[var(--accent-ink)]">
          {shown}
        </span>
      )}
    </button>
  );
}

/**
 * Guest: person icon + "Sign in". Signed in: person icon + the Telegram initials ("ВБ").
 * The session is only known in the browser (HttpOnly cookies), so SSR and the first client render
 * show a skeleton. The button hugs its content (a fixed width left the signed-in state with big
 * empty paddings); the header's right group is right-aligned, so only the space to its left changes.
 */
/** Hug the content (icon + «Увійти» or icon + initials) instead of one fixed width for every state. */
const ACCOUNT_W = "w-11 lg:w-auto lg:px-3.5";
/** The skeleton can't know which state comes next; a width between the two keeps the shift small. */
const ACCOUNT_SKELETON_W = "w-11 lg:w-[96px]";

function AccountButton() {
  const { t, href } = useI18n();
  const { status, unread } = useSession();

  if (status === "loading") {
    return <span aria-hidden className={`shimmer block h-11 shrink-0 ${ACCOUNT_SKELETON_W}`} />;
  }

  const authed = status === "authed";
  // Only read after the session answered, i.e. never during SSR/hydration.
  const user = authed ? rememberedUser() : null;
  const letters = initials(user);
  const name = displayName(user);
  const label = authed ? (name ? t("header.accountOf", { name }) : t("header.account")) : t("header.login");

  return (
    <Link
      href={authed ? href("/account") : href("/login")}
      aria-label={label}
      title={label}
      className={`nb nb-hover tap relative flex h-11 shrink-0 items-center justify-center gap-2 text-[var(--ink)] ${ACCOUNT_W}`}
    >
      <User className={`h-5 w-5 shrink-0 ${letters ? "hidden lg:block" : ""}`} strokeWidth={2.75} />
      {authed ? (
        letters && (
          <span
            aria-hidden
            className="grid h-7 min-w-7 place-items-center rounded-[var(--r)] border-[2.5px] border-[var(--line)] bg-[var(--c3)] px-1 text-[12px] font-black leading-none tracking-wide"
          >
            {letters}
          </span>
        )
      ) : (
        <span aria-hidden className="hidden text-[13px] font-black uppercase tracking-wide lg:inline">
          {t("header.login")}
        </span>
      )}
      {authed && unread > 0 && (
        <span className="absolute -right-2 -top-2 grid h-6 min-w-6 place-items-center rounded-[var(--r)] border-[2.5px] border-[var(--line)] bg-[var(--c2)] px-1 text-[11px] font-black text-white">
          {unread}
        </span>
      )}
    </Link>
  );
}

function MobileMenu({
  open,
  onClose,
  categories,
  activeSlug,
}: {
  open: boolean;
  onClose: () => void;
  categories: PublicCategory[];
  activeSlug: string | null;
}) {
  const { t, href } = useI18n();
  const hydrated = useHydrated();
  useScrollLock(open);
  useEscape(open, onClose);
  // Portalled out of the header: its chrome tokens (dark surface) and its stacking context stay behind.
  if (!hydrated) return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="backdrop"
            {...noFadeFlash}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-black/50 lg:hidden"
            aria-hidden
          />
          <motion.aside
            key="sheet"
            role="dialog"
            aria-modal="true"
            aria-label={t("header.menu")}
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ type: "spring", stiffness: 340, damping: 36 }}
            className="fixed inset-y-0 left-0 z-50 flex w-[86vw] max-w-[360px] flex-col border-r-[3px] border-[var(--line)] bg-[var(--bg)] lg:hidden"
          >
            <div className="flex items-center justify-between border-b-[3px] border-[var(--line)] px-4 py-3">
              <Logo />
              <button
                type="button"
                onClick={onClose}
                aria-label={t("common.close")}
                className="nb-flat tap grid h-11 w-11 place-items-center text-[var(--ink)]"
              >
                <X className="h-5 w-5" strokeWidth={3} />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto px-4 py-4" aria-label={t("header.categories")}>
              <p className="nb-up mb-2 text-[11px] font-black text-[var(--faint)]">{t("header.categories")}</p>
              <ul className="flex flex-col gap-1.5">
                <li>
                  <MenuLink href={href("/catalog")} active={false}>
                    {t("header.allProducts")}
                  </MenuLink>
                </li>
                {categories.map((c) => (
                  <li key={c.id}>
                    <MenuLink href={href(`/catalog/${c.slug}`)} active={activeSlug === c.slug}>
                      {c.name}
                    </MenuLink>
                  </li>
                ))}
              </ul>
              <p className="nb-up mb-2 mt-6 text-[11px] font-black text-[var(--faint)]">{t("footer.customers")}</p>
              <ul className="flex flex-col gap-1.5">
                {(
                  [
                    ["/delivery", "info.delivery"],
                    ["/returns", "info.returns"],
                    ["/warranty", "info.warranty"],
                    ["/contacts", "info.contacts"],
                    ["/about", "info.about"],
                  ] as const
                ).map(([p, k]) => (
                  <li key={p}>
                    <MenuLink href={href(p)} active={false}>
                      {t(k)}
                    </MenuLink>
                  </li>
                ))}
              </ul>
            </nav>
            <div className="border-t-[3px] border-[var(--line)] px-4 py-3">
              <LangSwitch />
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}

function MenuLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex min-h-11 items-center rounded-[var(--r)] border-[2.5px] border-[var(--line)] px-3 text-[14px] font-extrabold ${
        active ? "bg-[var(--accent)] text-[var(--accent-ink)]" : "bg-[var(--surface)] text-[var(--ink)]"
      }`}
    >
      {children}
    </Link>
  );
}
