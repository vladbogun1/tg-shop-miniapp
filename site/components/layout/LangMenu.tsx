"use client";

/**
 * Header language dropdown. The trigger shows only the current two letters (UA / RU / EN — never a
 * flag: a flag is a country, not a language); the menu names each language in ITSELF.
 *
 * Every option is a real link to the same page under the other prefix (works without JavaScript,
 * crawlers see the alternates); with JavaScript the current query string is carried over.
 *
 * The menu is portalled into <body>: the sticky header is its own stacking context (z-40), and a
 * dropdown trapped inside one ends up under whatever the page raises above it (see the portal
 * lesson in UI-FIXES.md §3). It keeps the header's chrome tokens so it reads as part of the header.
 *
 * Keyboard: Enter / Space / ↓ open on the current language, ↑ opens on the last one; inside, ↑ ↓
 * Home End move, Enter / Space choose, Esc closes and returns focus, Tab closes.
 */
import { Check, ChevronDown } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { localePath, stripLocale } from "@/i18n";
import { useI18n } from "@/i18n/context";
import { LOCALE_NAME, LOCALE_SHORT, LOCALES, type Locale } from "@/i18n/locales";

interface Pos {
  top: number;
  right: number;
}

export function LangMenu() {
  const { locale, t } = useI18n();
  const pathname = stripLocale(usePathname() ?? "/");
  const router = useRouter();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<Pos | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const itemRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const focusOnOpen = useRef(0);

  const place = useCallback(() => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    setPos({ top: r.bottom + 8, right: document.documentElement.clientWidth - r.right });
  }, []);

  const close = useCallback((refocus: boolean) => {
    setOpen(false);
    if (refocus) btnRef.current?.focus();
  }, []);

  const openAt = (index: number) => {
    focusOnOpen.current = index;
    place();
    setOpen(true);
  };

  // Position before paint, then focus the requested item.
  useLayoutEffect(() => {
    if (!open) return;
    itemRefs.current[focusOnOpen.current]?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (btnRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, { passive: true });
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place);
    };
  }, [open, place]);

  // Navigation (a choice, or Back) closes it.
  useEffect(() => setOpen(false), [pathname, locale]);

  const current = LOCALES.indexOf(locale);

  function onTriggerKey(e: React.KeyboardEvent<HTMLButtonElement>) {
    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (open) close(false);
      else openAt(current);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      openAt(LOCALES.length - 1);
    }
  }

  function onMenuKey(e: React.KeyboardEvent<HTMLUListElement>) {
    const items = itemRefs.current;
    const at = items.findIndex((el) => el === document.activeElement);
    const focus = (i: number) => items[(i + items.length) % items.length]?.focus();
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        focus(at + 1);
        break;
      case "ArrowUp":
        e.preventDefault();
        focus(at - 1);
        break;
      case "Home":
        e.preventDefault();
        focus(0);
        break;
      case "End":
        e.preventDefault();
        focus(items.length - 1);
        break;
      case "Escape":
        e.preventDefault();
        close(true);
        break;
      case "Tab":
        close(false);
        break;
      case " ":
        e.preventDefault();
        items[at]?.click();
        break;
    }
  }

  function choose(e: React.MouseEvent<HTMLAnchorElement>, l: Locale, target: string) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    setOpen(false);
    btnRef.current?.focus();
    if (l !== locale) router.push(target + window.location.search);
  }

  const menuId = `${id}-menu`;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => (open ? close(false) : openAt(current))}
        onKeyDown={onTriggerKey}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`${t("header.lang")}: ${LOCALE_NAME[locale]}`}
        className={`nb nb-hover tap flex h-11 shrink-0 items-center justify-center gap-1 px-2.5 text-[13px] font-black tracking-wide text-[var(--ink)] transition-colors hover:bg-[var(--surface-2)] ${
          open ? "bg-[var(--surface-2)]" : ""
        }`}
      >
        <span lang={locale}>{LOCALE_SHORT[locale]}</span>
        <ChevronDown
          className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
          strokeWidth={3}
          aria-hidden
        />
      </button>

      {open &&
        pos &&
        createPortal(
          <ul
            ref={menuRef}
            id={menuId}
            role="menu"
            aria-label={t("header.lang")}
            onKeyDown={onMenuKey}
            style={{ top: pos.top, right: pos.right }}
            className="chrome fixed z-[60] min-w-[184px] rounded-[var(--r)] border-[3px] border-[var(--line)] p-1.5 shadow-[5px_5px_0_var(--accent)]"
          >
            {LOCALES.map((l, i) => {
              const target = localePath(l, pathname);
              const active = l === locale;
              return (
                <li key={l} role="none">
                  <Link
                    ref={(el) => {
                      itemRefs.current[i] = el;
                    }}
                    href={target}
                    hrefLang={l}
                    lang={l}
                    role="menuitemradio"
                    aria-checked={active}
                    tabIndex={-1}
                    onClick={(e) => choose(e, l, target)}
                    className={`flex min-h-11 items-center gap-3 rounded-[var(--r)] px-3 text-[14px] font-extrabold ${
                      active
                        ? "bg-[var(--accent)] text-[var(--accent-ink)]"
                        : "text-[var(--ink)] hover:bg-[var(--surface-2)] focus:bg-[var(--surface-2)]"
                    }`}
                  >
                    <span className="w-6 text-[11px] font-black tracking-wide opacity-70">{LOCALE_SHORT[l]}</span>
                    <span className="flex-1">{LOCALE_NAME[l]}</span>
                    {active && <Check className="h-4 w-4" strokeWidth={3} aria-hidden />}
                  </Link>
                </li>
              );
            })}
          </ul>,
          document.body
        )}
    </>
  );
}
