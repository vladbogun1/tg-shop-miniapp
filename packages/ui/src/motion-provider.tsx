"use client";

import { LazyMotion } from "framer-motion";
import type { ReactNode } from "react";

/** domMax = animations + layout + drag (the apps use all three). Loaded after the first paint, not in First Load JS. */
const loadFeatures = () => import("./motion-features").then((mod) => mod.default);

/**
 * Wrap the app once: components from @shop/ui (and the site) use the light `m.*` elements, whose
 * animation engine arrives as a separate chunk through this provider.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return <LazyMotion features={loadFeatures}>{children}</LazyMotion>;
}
