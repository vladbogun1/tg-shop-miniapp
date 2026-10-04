/**
 * What a tap landed on — for the click journal of the Mini App and the website.
 *
 * `label` is the interactive element the tap was meant for (closest button/link/field), as before.
 * `hit` is the element hit-testing actually returned under the finger, described by tag, id, a few
 * classes and whether something fixed/absolute sits there. When an invisible overlay swallows taps
 * ("nothing reacts"), `label` is empty and `hit` names the overlay — the case is visible in the data
 * instead of being guessed. Field values are never read.
 */
export interface TapInfo {
  label?: string;
  meta: string;
}

function hitOf(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const id = el.id ? `#${el.id.slice(0, 30)}` : "";
  const cls =
    typeof el.className === "string"
      ? el.className
          .split(/\s+/)
          .filter(Boolean)
          .slice(0, 4)
          .map((c) => `.${c.slice(0, 40)}`)
          .join("")
      : "";
  let pos = "";
  try {
    const cs = getComputedStyle(el);
    if (cs.position === "fixed" || cs.position === "absolute") {
      pos = ` [${cs.position}${cs.zIndex !== "auto" ? ` z${cs.zIndex}` : ""}]`;
    }
  } catch {
    /* detached node */
  }
  return `${tag}${id}${cls}${pos}`.slice(0, 200);
}

/** A short, privacy-safe label of the interactive element a tap belongs to. */
export function tapLabel(target: Element): string | undefined {
  const el = target.closest("[data-analytics],button,a,input,textarea,select,[role='button']");
  if (!el) return undefined;

  const name = el.getAttribute("data-analytics");
  if (name) return name.slice(0, 120);

  const tag = el.tagName.toLowerCase();
  // Never read a value: the journal must not end up holding phone numbers or promo codes.
  if (tag === "input" || tag === "textarea" || tag === "select") {
    return `${tag}:${el.getAttribute("aria-label") ?? el.getAttribute("name") ?? "field"}`;
  }
  const label = el.getAttribute("aria-label") ?? (el.textContent ?? "").replace(/\s+/g, " ").trim();
  return `${tag}:${label.slice(0, 60)}`;
}

/** Describes a click: what it was meant for and what was really under the finger. */
export function describeTap(e: MouseEvent): TapInfo | null {
  const target = e.target;
  if (!(target instanceof Element)) return null;
  // e.target is the hit-tested element; elementFromPoint double-checks it after the handlers ran
  // (a sheet that closed on pointerdown, an overlay that appeared in between).
  let under: Element | null = null;
  try {
    under = document.elementFromPoint(e.clientX, e.clientY);
  } catch {
    under = null;
  }
  const meta: Record<string, unknown> = {
    hit: hitOf(target),
    x: Math.round(e.clientX),
    y: Math.round(e.clientY),
    vw: window.innerWidth,
    vh: window.innerHeight,
  };
  if (under && under !== target) meta.under = hitOf(under);
  return { label: tapLabel(target), meta: JSON.stringify(meta).slice(0, 500) };
}
