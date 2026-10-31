"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, ChevronDown, LayoutGrid } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { noFadeFlash } from "@shop/ui/motion";
import { artKindOf } from "@/components/mascot/category-kind";
import { type MenuNode } from "@/features/catalog";
import { useI18n } from "@/i18n/context";
import { useEscape } from "@/lib/hooks";

export function CatalogMenu({
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
      className="static"
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
            className="absolute inset-x-0 top-full z-50"
          >
            <div className="container-site pointer-events-none pt-2">
            <nav
              aria-label={t("header.categories")}
              className="pointer-events-auto relative w-full max-w-[880px] before:absolute before:inset-x-0 before:-top-2 before:h-2 before:content-[''] rounded-[var(--r-card)] border border-[var(--line-strong)] bg-[var(--surface)] p-3 shadow-[0_24px_60px_rgba(0,0,0,.6)]"
            >
              <ul className="grid grid-cols-2 gap-2">
                {tree.map((root) => {
                  const on = activeRoot === root.slug;
                  const kind = artKindOf(root.artKind, root.slug, root.name);
                  return (
                    <li
                      key={root.id}
                      className={`relative flex min-h-[78px] min-w-0 items-center gap-3 rounded-[var(--r)] border px-3 py-2.5 transition-colors ${
                        on
                          ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                          : "border-[var(--line)] hover:border-[var(--line-strong)] hover:bg-[var(--surface-2)]"
                      }`}
                    >
                      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[var(--r)] bg-[var(--bg)]">
                        { }
                        <img src={`/mascot/icons/${kind}.webp`} alt="" width={36} height={36} loading="lazy" className="h-9 w-9 object-contain" />
                      </span>
                      <div className="min-w-0 flex-1">
                        {/* the root's link covers the whole tile; the subcategory chips sit above it */}
                        <Link
                          href={href(`/catalog/${root.slug}`)}
                          aria-current={activeSlug === root.slug ? "page" : undefined}
                          className={`flex items-baseline gap-2 after:absolute after:inset-0 after:rounded-[var(--r)] after:content-[''] ${
                            on ? "text-[var(--accent-hi)]" : "text-[var(--ink)]"
                          }`}
                        >
                          <span className="min-w-0 truncate font-display text-[14px] font-bold uppercase tracking-[.04em]">{root.name}</span>
                          <span className="shrink-0 font-display text-[12px] tabular-nums text-[var(--muted)]">{root.productCount}</span>
                        </Link>
                        {root.children.length > 0 && (
                          <div className="relative z-[1] mt-1.5 flex flex-wrap gap-1.5">
                            {root.children.map((c) => (
                              <Link
                                key={c.id}
                                href={href(`/catalog/${c.slug}`)}
                                aria-current={activeSlug === c.slug ? "page" : undefined}
                                className={`inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[12px] font-medium transition-colors ${
                                  activeSlug === c.slug
                                    ? "border-[var(--accent)] text-[var(--accent-hi)]"
                                    : "border-[var(--line-strong)] bg-[var(--surface)] text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--ink)]"
                                }`}
                              >
                                {c.name}
                                <span className="font-display text-[11px] tabular-nums opacity-60">{c.productCount}</span>
                              </Link>
                            ))}
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
              <Link
                href={href("/catalog")}
                className="mt-3 flex h-11 items-center justify-center gap-2 rounded-[var(--r)] border border-[var(--line)] font-display text-[13px] font-semibold uppercase tracking-[.1em] text-[var(--muted)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent-hi)]"
              >
                <LayoutGrid className="h-4 w-4" strokeWidth={2.25} />
                {t("header.allProducts")}
                <ArrowRight className="h-4 w-4" strokeWidth={2.25} />
              </Link>
            </nav>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Header section link: Exo 2 caps; the current section gets an orange underline with a glow. */
export function NavLink({
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

