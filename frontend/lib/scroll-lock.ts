import { lockPageScroll } from "@shop/ui/overlay";

/**
 * Page-scroll lock of the Mini App's own fullscreen sheets (product view, comparison): the shared
 * counted lock from `@shop/ui/overlay` plus `html[data-sheet]` (the tab bar stays over the sheet,
 * see globals.css). The attribute is counted too — the product view fading out under an open
 * comparison must not drop it.
 */

type SheetDoc = { documentElement: { setAttribute(name: string, value: string): void; removeAttribute(name: string): void } };

let sheets = 0;

export function lockSheet(doc: SheetDoc = document, lockScroll: () => () => void = lockPageScroll): () => void {
  const unlockScroll = lockScroll();
  if (sheets++ === 0) doc.documentElement.setAttribute("data-sheet", "");
  let released = false;
  return () => {
    if (released) return;
    released = true;
    unlockScroll();
    if (--sheets === 0) doc.documentElement.removeAttribute("data-sheet");
  };
}
