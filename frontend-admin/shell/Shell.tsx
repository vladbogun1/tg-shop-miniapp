"use client";

/**
 * App shell.
 *  - Desktop (lg+): fixed sidebar + sticky top bar.
 *  - Phone: sticky top bar (under the status bar in the installed app — safe-area padded) and a
 *    bottom tab bar for the daily screens: Внимание · Заказы · Отправка · Товары · Ещё. «Ещё»
 *    opens the full menu drawer with everything else.
 * Animated active indicators and page transitions on both. ChiSetup v3 look (DESIGN-V3 §8):
 * graphite chrome, hairlines, active item = orange text/icon + 2px glowing orange indicator.
 * The desktop sidebar collapses to an icon rail (CS mark on top), remembered per browser.
 */
import { motion } from "framer-motion";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { AppRuntime } from "@/components/pwa/AppRuntime";
import { InstallBanner, PushOfferBanner, UpdateBanner } from "@/components/pwa/Banners";
import { NotificationsBell } from "@/components/NotificationsBell";
import { LogoMark } from "@/components/brand/Logo";
import { cn } from "@/lib/cn";
import { MobileMenu } from "./MobileMenu";
import { SidebarInner } from "./Sidebar";
import { TabBar } from "./TabBar";
import { pageTitle } from "./nav-config";
import { useCollapsedSidebar } from "./use-collapsed-sidebar";

export function Shell({ children }: { children: ReactNode }) {
  const [drawer, setDrawer] = useState(false);
  const [collapsed, toggleCollapsed] = useCollapsedSidebar();
  const pathname = usePathname();
  const title = pageTitle(pathname);

  // Any navigation (menu link, system back, a tapped notification) closes the menu.
  useEffect(() => {
    setDrawer(false);
  }, [pathname]);

  return (
    <div className="flex min-h-dvh">
      <AppRuntime />

      {/* Desktop sidebar (icon rail when collapsed) */}
      <aside
        className={cn(
          "thin-scroll sticky top-0 hidden h-dvh shrink-0 flex-col overflow-y-auto border-r border-[var(--line)] bg-[var(--surface)] px-3 py-5 transition-[width] duration-200 lg:flex",
          collapsed ? "w-[76px]" : "w-[248px]",
        )}
      >
        <SidebarInner
          collapsed={collapsed}
          onToggleCollapsed={toggleCollapsed}
          layoutScope="sidebar"
        />
      </aside>


      <MobileMenu open={drawer} onClose={() => setDrawer(false)} />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar — on a phone it sits under the status bar of the installed app */}
        <header
          data-app-chrome
          className="sticky top-0 z-30 flex items-center gap-3 border-b border-[var(--line)] bg-[rgba(14,14,16,.85)] pb-2.5 pl-[max(16px,var(--safe-left))] pr-[max(16px,var(--safe-right))] pt-[calc(10px+var(--safe-top))] backdrop-blur-md lg:min-h-[61px] lg:px-7 lg:py-2.5"
        >
          <LogoMark size={28} className="lg:hidden" />
          <div className="font-display min-w-0 truncate text-[16px] font-bold uppercase tracking-[0.06em] text-[var(--text)] lg:text-[13px] lg:font-semibold lg:tracking-[0.2em] lg:text-[var(--text-muted)]">
            {title}
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-2.5">
            {/* On a phone the «Внимание» tab carries the same badge — no second bell there. */}
            <div className="hidden lg:block">
              <NotificationsBell />
            </div>
          </div>
        </header>

        <main className="min-w-0 flex-1 pb-[calc(var(--bottom-nav)+20px)] pl-[max(16px,var(--safe-left))] pr-[max(16px,var(--safe-right))] pt-4 lg:p-7">
          <InstallBanner />
          <PushOfferBanner />
          <motion.div
            key={pathname}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
          >
            {children}
          </motion.div>
        </main>
      </div>

      <TabBar menuOpen={drawer} onMenu={() => setDrawer((v) => !v)} />
      <UpdateBanner />
    </div>
  );
}
