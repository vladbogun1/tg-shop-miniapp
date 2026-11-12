"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { noteRoute, startTelemetry, TELEMETRY_ENABLED } from "./runtime";

/** Телеметрия админки на время жизни оболочки (после входа). Ставится один раз — в AppRuntime. */
export function useAdminTelemetry(): void {
  const pathname = usePathname();

  useEffect(() => {
    if (!TELEMETRY_ENABLED) return;
    return startTelemetry();
  }, []);

  useEffect(() => {
    if (TELEMETRY_ENABLED && pathname) noteRoute(pathname);
  }, [pathname]);
}
