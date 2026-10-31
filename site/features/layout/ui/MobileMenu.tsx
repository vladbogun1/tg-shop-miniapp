"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { noFadeFlash } from "@shop/ui/motion";
import { type MenuNode } from "@/features/catalog";
import { useI18n } from "@/i18n/context";
import { CompareOpenButton } from "@/features/compare/view/CompareToggle";
import { useEscape, useHydrated, useScrollLock } from "@/lib/hooks";
import { LangSwitch } from "./LangSwitch";
import { Logo } from "./Logo";
import { SupportGate } from "@/features/support/view/SupportGate";

export function MobileMenu({
  open,
  onClose,
  tree,
  activeSlug,
  activeRoot,
  hasComing,
}: {
  open: boolean;
  onClose: () => void;
  tree: MenuNode[];
  activeSlug: string | null;
  activeRoot: string | null;
  hasComing: boolean;
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
              <CompareOpenButton variant="menu" className="mb-5" onOpen={onClose} />
              <p className="eyebrow mb-2 text-[11px]">{t("header.categories")}</p>
              <ul className="flex flex-col gap-1.5">
                <li>
                  <MenuLink href={href("/catalog")} active={false}>
                    {t("header.allProducts")}
                  </MenuLink>
                </li>
                {hasComing && (
                  <li>
                    <MenuLink href={href("/coming-soon")} active={false}>
                      {t("preorder.coming.title")}
                    </MenuLink>
                  </li>
                )}
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

export function MenuLink({
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
