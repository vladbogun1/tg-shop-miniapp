"use client";

import { Menu } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { type MenuNode, rootOf } from "@/features/catalog";
import { stripLocale } from "@/i18n";
import { useI18n } from "@/i18n/context";
import { CompareOpenButton } from "@/features/compare/view/CompareToggle";
import { LangMenu } from "./LangMenu";
import { Logo } from "./Logo";
import { SearchBox } from "./SearchBox";
import { SupportGate } from "@/features/support/view/SupportGate";
import "./header.css";
import { CompareButton, CartButton, AccountButton } from "./HeaderButtons";
import { MobileMenu } from "./MobileMenu";
import { CatalogMenu, NavLink } from "./CatalogMenu";

export function Header({ tree, hasComing = false }: { tree: MenuNode[]; /** Open pre-order batches exist: «Скоро в наявності» is in the menus. */ hasComing?: boolean }) {
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
          {hasComing && (
            <NavLink href={href("/coming-soon")} active={pathname === "/coming-soon"} className="hidden xl:inline-flex">
              {t("preorder.coming.title")}
            </NavLink>
          )}
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
          <CompareButton />
          <CartButton />
        </div>
      </div>

      <MobileMenu open={menuOpen} onClose={closeMenu} tree={tree} activeSlug={activeSlug} activeRoot={activeRoot} hasComing={hasComing} />
    </header>
    {/* phone: search on its own row, outside the sticky bar — it scrolls away (see above) */}
    <div ref={searchRow} className="hdr-row2 chrome container-site border-b border-[var(--line)] pb-3 pt-0.5 md:hidden">
      <SearchBox />
    </div>
    </>
  );
}

/**
 * Scales + count; only while something is in the comparison, and only from md up — on a phone the
 * header has no room for a fifth button (it pushed the cart off screen); there it is in the catalog's
 * sticky row and in the burger menu (CompareOpenButton).
 */
