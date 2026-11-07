"use client";

import { useEffect, useMemo, useState } from "react";

/**
 * The group whose section is under the sticky toolbar right now (for the chip highlight).
 * `null` while the first group is not yet scrolled past or when nothing is observed.
 */
export function useActiveGroup(ids: string[], enabled: boolean): string | null {
  const [active, setActive] = useState<string | null>(null);
  // A new array on every render must not re-create the observer: depend on the list's content.
  const key = ids.join("|");
  const list = useMemo(() => (key ? key.split("|") : []), [key]);

  useEffect(() => {
    if (!enabled || typeof IntersectionObserver === "undefined") {
      setActive(null);
      return;
    }
    const seen = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const id = e.target.id.replace(/^inbox-/, "");
          if (e.isIntersecting) seen.add(id);
          else seen.delete(id);
        }
        // The topmost visible section (sections are in the page order).
        setActive(list.find((id) => seen.has(id)) ?? null);
      },
      // The top band is the toolbar: a section counts as current while it overlaps the strip under it.
      { rootMargin: "-120px 0px -55% 0px" }
    );
    for (const id of list) {
      const el = document.getElementById(`inbox-${id}`);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [list, enabled]);

  return active;
}
