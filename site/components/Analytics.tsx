"use client";

/**
 * Starts the website event journal and records a page view on every route change; `TrackProductView`
 * is dropped into the (server-rendered) product page to record which product was opened.
 */
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { startAnalytics, trackPageView, trackProductView } from "@/lib/analytics";

export function Analytics() {
  const pathname = usePathname();
  useEffect(() => startAnalytics(), []);
  useEffect(() => {
    trackPageView();
  }, [pathname]);
  return null;
}

export function TrackProductView({ productId }: { productId: string }) {
  useEffect(() => {
    trackProductView(productId);
  }, [productId]);
  return null;
}
