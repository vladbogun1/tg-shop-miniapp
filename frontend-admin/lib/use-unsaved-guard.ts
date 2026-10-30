"use client";

import { requestConfirm } from "@shop/ui/confirm";
import { useEffect } from "react";

const MESSAGE = "Есть несохранённые изменения. Уйти без сохранения?";
// beforeunload — единственное место, где браузер сам показывает свой диалог (закрытие вкладки): подменить его нельзя.

/**
 * Warns before leaving a page with unsaved edits: closing/reloading the tab (beforeunload) and
 * clicking an in-app link (the menu). Next's App Router has no route-change event to cancel, so
 * internal <a> clicks are intercepted in the capture phase: the click is stopped, the admin is asked in
 * our own dialog, and on «Уйти» the same click is replayed.
 */
export function useUnsavedGuard(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = MESSAGE;
      return MESSAGE;
    };
    let replaying = false;
    const onClick = (e: MouseEvent) => {
      if (replaying) return;
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank") return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname === window.location.pathname) return;
      e.preventDefault();
      e.stopPropagation();
      void requestConfirm({ title: "Уйти без сохранения?", message: MESSAGE, confirmLabel: "Уйти", danger: true }).then((ok) => {
        if (!ok) return;
        replaying = true;
        a.click();
        replaying = false;
      });
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty]);
}
