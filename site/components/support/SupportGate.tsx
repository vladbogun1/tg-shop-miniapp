"use client";

/**
 * Renders its children only while support is switched on (public config, cached). Lets the header
 * and the server-rendered footer show «Підтримка» links without knowing about the config.
 */
import { useSupportConfig } from "@/lib/support";

export function SupportGate({ children }: { children: React.ReactNode }) {
  const { enabled } = useSupportConfig();
  return enabled ? <>{children}</> : null;
}
