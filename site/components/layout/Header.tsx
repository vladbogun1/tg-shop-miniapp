"use client";

/**
 * Sticky site header (DESIGN-V3 §6): translucent page colour + blur + hairline. Logo · section nav
 * (Exo 2) · search with live suggestions · language · account · cart. Categories: the «Каталог»
 * dropdown (roots + subcategories), the burger sheet (nested list), the home page and the sidebar. On phones the search drops to its own row.
 * One dark theme — there is no theme switch any more.
 *
 * Phones: the search row is NOT part of the sticky bar — it scrolls away with the page, and the
 * moment it has gone under the bar the bar turns compact (header.css): the wordmark gives way to the
 * CS mark, a compact search slides into the bar and the buttons shrink. The bar's height never
 * changes, so nothing on the page jumps.
 */
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, LayoutGrid, Menu, ShoppingBag, User, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { noFadeFlash } from "@shop/shared";
import { artKindOf } from "@/components/mascot/category-kind";
import { type MenuNode, rootOf } from "@/lib/category-tree";
import { stripLocale } from "@/i18n";
import { useI18n } from "@/i18n/context";
import { useCart, useCartCount } from "@/lib/cart";
import { useEscape, useHydrated, useScrollLock } from "@/lib/hooks";
import { displayName, initials, rememberedUser, useSession } from "@/lib/session";
import { LangMenu } from "./LangMenu";
import { LangSwitch } from "./LangSwitch";
import { Logo } from "./Logo";
import { SearchBox } from "./SearchBox";
import { SupportGate } from "@/components/support/SupportGate";
import { useSupportUnread } from "@/lib/support";
import "./header.css";

export function Header({ tree }: { tree: MenuNode[] }) {
  const { t, href } = useI18n();
  const pathname = stripLocale(usePathname() ?? "/");
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = useCallback(() => setMenuOpen(false), []);

  // Any navigation closes the burger sheet.
  useEffect(() => setMenuOpen(false), [pathname]);

  const activeSlug = pathname.startsWith("/catalog/") ? decodeURIComponent(pathname.split("/")[2] ?? "") : null;
  // A leaf's page highlights its root in the menus.
  const activeRoot = rootOf(tree, activeSlug)?.slug ?? null;

  // phones: compact once the search row has scrolled under the sticky bar
  const searchRow = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const row = searchRow.current;
    if (!row || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(
      ([e]) => setCompact(!e.isIntersecting && e.boundingClientRect.top < (e.rootBounds?.top ?? 72)),
      // the root's top edge sits at the bar's bottom: the row counts as gone once it is fully under the bar
      { rootMargin: "-72px 0px 0px 0px", threshold: 0 }
    );
    io.observe(row);
    return () => io.disconnect();
  }, []);

  return (
    <>
    <header
      data-compact={compact || undefined}
      className="site-header chrome sticky top-0 z-40 border-b border-[var(--line)] backdrop-blur-[12px] backdrop-saturate-150"
    >
      <a href="#main" className="skip-link nb px-3 py-2 font-display text-[13px] font-bold uppercase">
        {t("header.skip")}
      </a>
      <div className="container-site flex h-[var(--header-h)] items-center gap-2 md:gap-3">
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          aria-label={t("header.menu")}
          aria-expanded={menuOpen}
          className="tap grid h-11 w-11 shrink-0 place-items-center rounded-[var(--r)] border border-[var(--line)] bg-[var(--surface)] text-[var(--ink)] transition-colors hover:border-[var(--line-strong)] lg:hidden"
        >
          <Menu className="h-5 w-5" strokeWidth={2.25} />
        </button>
        <span className="hdr-word inline-flex">
          <Logo />
        </span>
        <span className="hdr-mark">
          <Link href={href("/")} aria-label={t("header.home")} tabIndex={compact ? 0 : -1} className="block rounded-[10px]">
            { }
            <img src="/icon.svg" alt="" width={36} height={36} className="block h-9 w-9 rounded-[10px]" />
          </Link>
        </span>
        <div className="hdr-csearch min-w-0 flex-1" aria-hidden={!compact} inert={!compact}>
          <SearchBox compact />
        </div>
        <nav aria-label={t("header.nav")} className="ml-3 hidden shrink-0 items-center gap-1 lg:flex">
          <CatalogMenu tree={tree} active={pathname === "/catalog" || !!activeSlug} activeSlug={activeSlug} activeRoot={activeRoot} />
          <NavLink href={href("/delivery")} active={pathname === "/delivery"} className="hidden xl:inline-flex">
            {t("header.nav.delivery")}
          </NavLink>
          <NavLink href={href("/contacts")} active={pathname === "/contacts"} className="hidden xl:inline-flex">
            {t("header.nav.contacts")}
          </NavLink>
          <SupportGate>
            <NavLink href={href("/account/support")} active={pathname.startsWith("/account/support")} className="hidden xl:inline-flex">
              {t("support.nav")}
            </NavLink>
          </SupportGate>
        </nav>
        <div className="mx-1 hidden min-w-0 flex-1 md:block">
          <SearchBox />
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2 md:ml-0">
          <div className="hidden sm:block">
            <LangMenu />
          </div>
          <AccountButton />
          <CartButton />
        </div>
      </div>

      <MobileMenu open={menuOpen} onClose={closeMenu} tree={tree} activeSlug={activeSlug} activeRoot={activeRoot} />
    </header>
    {/* phone: search on its own row, outside the sticky bar — it scrolls away (see above) */}
    <div ref={searchRow} className="hdr-row2 chrome container-site border-b border-[var(--line)] pb-3 pt-0.5 md:hidden">
      <SearchBox />
    </div>
    </>
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
      className="tap relative grid h-11 w-11 shrink-0 place-items-center rounded-[var(--r)] border border-[var(--line)] bg-[var(--surface)] text-[var(--ink)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent-hi)] xl:w-auto xl:grid-flow-col xl:gap-2 xl:px-4"
    >
      <ShoppingBag className="h-5 w-5" strokeWidth={2.25} />
      <span className="hidden font-display text-[13px] font-semibold uppercase tracking-[.08em] xl:inline">{t("header.cart")}</span>
      {shown > 0 && (
        <span className="absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-[var(--accent)] px-1 font-display text-[11px] font-bold leading-none text-[var(--accent-ink)] shadow-[0_0_10px_rgba(255,102,0,.6)]">
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
  const { status, unread: orderUnread } = useSession();
  const unread = orderUnread + useSupportUnread();

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
      className={`tap relative flex h-11 shrink-0 items-center justify-center gap-2 rounded-[var(--r)] border border-[var(--line)] bg-[var(--surface)] text-[var(--ink)] transition-colors hover:border-[var(--line-strong)] ${ACCOUNT_W}`}
    >
      <User className={`h-5 w-5 shrink-0 ${letters ? "hidden lg:block" : ""}`} strokeWidth={2.25} />
      {authed ? (
        letters && (
          <span
            aria-hidden
            className="grid h-7 min-w-7 place-items-center rounded-full border border-[var(--accent)] bg-[var(--accent-soft)] px-1 font-display text-[12px] font-bold leading-none tracking-wide text-[var(--accent-hi)]"
          >
            {letters}
          </span>
        )
      ) : (
        <span aria-hidden className="hidden font-display text-[13px] font-semibold uppercase tracking-[.08em] lg:inline">
          {t("header.login")}
        </span>
      )}
      {authed && unread > 0 && (
        <span className="absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-[var(--accent)] px-1 font-display text-[11px] font-bold leading-none text-[var(--accent-ink)]">
          {unread}
        </span>
      )}
    </Link>
  );
}

function MobileMenu({
  open,
  onClose,
  tree,
  activeSlug,
  activeRoot,
}: {
  open: boolean;
  onClose: () => void;
  tree: MenuNode[];
  activeSlug: string | null;
  activeRoot: string | null;
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
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[6px] lg:hidden"
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
            className="fixed inset-y-0 left-0 z-50 flex w-[86vw] max-w-[360px] flex-col border-r border-[var(--line-strong)] bg-[var(--surface)] lg:hidden"
          >
            <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
              <Logo />
              <button
                type="button"
                onClick={onClose}
                aria-label={t("common.close")}
                className="tap grid h-11 w-11 place-items-center rounded-[var(--r)] border border-[var(--line)] bg-[var(--surface-2)] text-[var(--ink)]"
              >
                <X className="h-5 w-5" strokeWidth={2.25} />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto px-4 py-4" aria-label={t("header.categories")}>
              <p className="eyebrow mb-2 text-[11px]">{t("header.categories")}</p>
              <ul className="flex flex-col gap-1.5">
                <li>
                  <MenuLink href={href("/catalog")} active={false}>
                    {t("header.allProducts")}
                  </MenuLink>
                </li>
                {tree.map((c) => (
                  <li key={c.id}>
                    <MenuLink href={href(`/catalog/${c.slug}`)} active={activeSlug === c.slug} inPath={activeRoot === c.slug && activeSlug !== c.slug} count={c.productCount}>
                      {c.name}
                    </MenuLink>
                    {c.children.length > 0 && (
                      <ul className="ml-4 mt-1 flex flex-col gap-0.5 border-l border-[var(--line-strong)] pl-2.5">
                        {c.children.map((k) => (
                          <li key={k.id}>
                            <MenuLink href={href(`/catalog/${k.slug}`)} active={activeSlug === k.slug} count={k.productCount} small>
                              {k.name}
                            </MenuLink>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
              <p className="eyebrow mb-2 mt-6 text-[11px]">{t("footer.customers")}</p>
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
                <SupportGate>
                  <li>
                    <MenuLink href={href("/account/support")} active={false}>
                      {t("support.nav")}
                    </MenuLink>
                  </li>
                </SupportGate>
              </ul>
            </nav>
            <div className="border-t border-[var(--line)] px-4 py-3">
              <LangSwitch />
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}

function MenuLink({
  href,
  active,
  inPath,
  count,
  small,
  children,
}: {
  href: string;
  active: boolean;
  /** Root of the leaf being viewed. */
  inPath?: boolean;
  count?: number;
  small?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex items-center justify-between gap-2 rounded-[var(--r)] border px-3 font-medium transition-colors ${small ? "min-h-10 text-[13px]" : "min-h-11 text-[14px]"} ${
        active
          ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-hi)]"
          : inPath
            ? "border-[var(--line-strong)] text-[var(--ink)] hover:bg-[var(--surface-2)]"
            : `border-transparent hover:bg-[var(--surface-2)] ${small ? "text-[var(--muted)]" : "text-[var(--ink)]"}`
      }`}
    >
      <span className="min-w-0 truncate">{children}</span>
      {count !== undefined && <span className="shrink-0 font-display text-[12px] tabular-nums opacity-60">{count}</span>}
    </Link>
  );
}

/**
 * Desktop «Каталог»: a link to the whole catalog that also opens (hover / focus / click on the
 * chevron) a panel with the root categories — each with its device icon and, for a parent, the
 * list of its subcategories. The root of the page being viewed is highlighted.
 */
function CatalogMenu({
  tree,
  active,
  activeSlug,
  activeRoot,
}: {
  tree: MenuNode[];
  active: boolean;
  activeSlug: string | null;
  activeRoot: string | null;
}) {
  const { t, href } = useI18n();
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const closeTimer = useRef<number | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const pointer = useRef("");
  useEffect(() => setOpen(false), [pathname]);
  useEscape(open, () => setOpen(false));
  const show = () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const hide = () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setOpen(false), 160);
  };
  if (tree.length === 0) {
    return (
      <NavLink href={href("/catalog")} active={active}>
        <LayoutGrid className="h-4 w-4" strokeWidth={2.25} />
        {t("header.catalog")}
      </NavLink>
    );
  }
  return (
    <div
      ref={wrap}
      className="relative"
      onPointerEnter={(e) => e.pointerType === "mouse" && show()}
      onPointerLeave={(e) => e.pointerType === "mouse" && hide()}
      onBlur={(e) => {
        if (!wrap.current?.contains(e.relatedTarget as Node)) setOpen(false);
      }}
    >
      <div className="flex items-center">
        <NavLink href={href("/catalog")} active={active}>
          <LayoutGrid className="h-4 w-4" strokeWidth={2.25} />
          {t("header.catalog")}
        </NavLink>
        <button
          type="button"
          aria-expanded={open}
          aria-haspopup="true"
          aria-label={t("header.categories")}
          onPointerDown={(e) => (pointer.current = e.pointerType)}
          // With a mouse the hover has already opened it — a click must not close it again.
          onClick={() => setOpen((v) => (pointer.current === "mouse" ? true : !v))}
          className="-ml-2 grid h-11 w-7 place-items-center rounded-[var(--r)] text-[var(--muted)] transition-colors hover:text-[var(--ink)]"
        >
          <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} strokeWidth={2.25} />
        </button>
      </div>
      <AnimatePresence>
        {open && (
          <motion.div
            {...noFadeFlash}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.16 }}
            className="absolute left-0 top-full z-50 pt-2"
          >
            <nav
              aria-label={t("header.categories")}
              className="grid w-[min(860px,calc(100vw-48px))] grid-cols-3 gap-x-4 gap-y-1 rounded-[var(--r-card)] border border-[var(--line-strong)] bg-[var(--surface)] p-4 shadow-[0_24px_60px_rgba(0,0,0,.6)]"
            >
              {tree.map((root) => {
                const on = activeRoot === root.slug;
                const kind = artKindOf(root.artKind, root.slug, root.name);
                return (
                  <div key={root.id} className="min-w-0 py-1">
                    <Link
                      href={href(`/catalog/${root.slug}`)}
                      aria-current={activeSlug === root.slug ? "page" : undefined}
                      className={`flex items-center gap-3 rounded-[var(--r)] border px-2 py-1.5 transition-colors ${
                        on ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-hi)]" : "border-transparent text-[var(--ink)] hover:bg-[var(--surface-2)]"
                      }`}
                    >
                      { }
                      <img src={`/mascot/icons/${kind}.webp`} alt="" width={32} height={32} loading="lazy" className="h-8 w-8 shrink-0 object-contain" />
                      <span className="min-w-0 flex-1 truncate font-display text-[14px] font-bold uppercase tracking-[.04em]">{root.name}</span>
                      <span className="shrink-0 font-display text-[12px] tabular-nums opacity-60">{root.productCount}</span>
                    </Link>
                    {root.children.length > 0 && (
                      <ul className="ml-[22px] mt-1 flex flex-col border-l border-[var(--line-strong)] pl-3">
                        {root.children.map((c) => (
                          <li key={c.id}>
                            <Link
                              href={href(`/catalog/${c.slug}`)}
                              aria-current={activeSlug === c.slug ? "page" : undefined}
                              className={`flex min-h-8 items-center justify-between gap-2 rounded-[var(--r)] px-2 text-[13px] font-medium transition-colors ${
                                activeSlug === c.slug ? "text-[var(--accent-hi)]" : "text-[var(--muted)] hover:text-[var(--ink)]"
                              }`}
                            >
                              <span className="min-w-0 truncate">{c.name}</span>
                              <span className="shrink-0 font-display text-[11px] tabular-nums opacity-60">{c.productCount}</span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Header section link: Exo 2 caps; the current section gets an orange underline with a glow. */
function NavLink({
  href,
  active,
  className = "",
  children,
}: {
  href: string;
  active: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`relative inline-flex h-11 items-center gap-2 rounded-[var(--r)] px-3 font-display text-[13px] font-semibold uppercase tracking-[.1em] transition-colors ${
        active ? "text-[var(--ink)]" : "text-[var(--muted)] hover:text-[var(--ink)]"
      } ${className}`}
    >
      {children}
      {active && (
        <span aria-hidden className="absolute inset-x-3 bottom-1 h-[2px] rounded-full bg-[var(--accent)] shadow-[0_0_8px_rgba(255,102,0,.7)]" />
      )}
    </Link>
  );
}
