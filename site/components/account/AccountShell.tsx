"use client";

/**
 * Account frame: sign-in gate + left menu (Заказы · Профиль и настройки · Устройства · Выйти),
 * a horizontal tab row on phones.
 */
import { Loader2, LogOut, MonitorSmartphone, Package, Settings } from "lucide-react";
import { MessageSquareText } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { stripLocale } from "@/i18n";
import { useI18n } from "@/i18n/context";
import { displayName, rememberedUser, useLogout, useSession } from "@/lib/session";
import { LifeBuoy } from "lucide-react";
import { useSupportConfig, useSupportUnread } from "@/lib/support";

export function AccountShell({ children }: { children: React.ReactNode }) {
  const { t, href } = useI18n();
  const router = useRouter();
  const rawPath = usePathname() ?? "/";
  const path = stripLocale(rawPath);
  const session = useSession();
  const logout = useLogout();
  const { enabled: supportEnabled } = useSupportConfig();
  const supportUnread = useSupportUnread();
  const [name, setName] = useState<string | null>(null);
  useEffect(() => setName(displayName(rememberedUser())), []);

  useEffect(() => {
    if (session.status === "guest") {
      router.replace(href(`/login?next=${encodeURIComponent(rawPath)}`));
    }
  }, [session.status, router, href, rawPath]);

  if (session.status !== "authed") {
    return (
      <div className="container-site pt-10">
        <p className="flex items-center gap-2 text-[15px] font-medium text-[var(--muted)]">
          <Loader2 className="h-5 w-5 animate-spin" /> {t("common.loading")}
        </p>
      </div>
    );
  }

  const items = [
    { href: "/account", label: t("account.orders"), icon: Package, active: path === "/account" || path.startsWith("/account/orders") },
    { href: "/account/reviews", label: t("account.reviews"), icon: MessageSquareText, active: path === "/account/reviews" },
    ...(supportEnabled ? [{ href: "/account/support", label: t("support.nav"), icon: LifeBuoy, active: path.startsWith("/account/support") }] : []),
    { href: "/account/settings", label: t("account.settings"), icon: Settings, active: path === "/account/settings" },
    { href: "/account/settings#sessions", label: t("account.devices"), icon: MonitorSmartphone, active: false },
  ];

  async function onLogout() {
    await logout();
    router.replace(href("/"));
  }

  return (
    <div className="container-site pt-8">
      <h1 className="font-display text-[30px] font-extrabold uppercase tracking-[.02em] text-[var(--ink)] sm:text-[38px]">{t("account.title")}</h1>
      <p className="mt-1 text-[15px] font-medium text-[var(--muted)]">
        {name ? t("account.hello", { name }) : t("account.helloAnon")}
      </p>
      <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-8">
        <nav aria-label={t("account.menu")} className="min-w-0">
          <ul className="no-scrollbar flex gap-2 overflow-x-auto pb-1 lg:sticky lg:top-[140px] lg:flex-col lg:overflow-visible">
            {items.map(({ href: h, label, icon: Icon, active }) => (
              <li key={h} className="shrink-0">
                <Link
                  href={href(h)}
                  aria-current={active ? "page" : undefined}
                  className={`flex min-h-11 items-center gap-2.5 whitespace-nowrap rounded-[var(--r)] border px-3.5 text-[14px] font-medium transition-colors ${
                    active
                      ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-hi)]"
                      : "border-[var(--line)] bg-[var(--surface)] text-[var(--ink)] hover:border-[var(--line-strong)] hover:bg-[var(--surface-2)]"
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" strokeWidth={2.25} />
                  {label}
                  {h === "/account/support" && supportUnread > 0 && (
                    <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[var(--accent)] px-1 font-display text-[11px] font-bold leading-none text-[var(--accent-ink)]">{supportUnread}</span>
                  )}
                </Link>
              </li>
            ))}
            <li className="shrink-0">
              <button
                type="button"
                onClick={() => void onLogout()}
                className="flex min-h-11 w-full items-center gap-2.5 whitespace-nowrap rounded-[var(--r)] border border-[var(--line)] bg-[var(--surface)] px-3.5 text-[14px] font-medium text-[var(--muted)] transition-colors hover:border-[var(--danger)] hover:text-[var(--danger)]"
              >
                <LogOut className="h-4 w-4 shrink-0" strokeWidth={2.25} />
                {t("account.logout")}
              </button>
            </li>
          </ul>
        </nav>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
