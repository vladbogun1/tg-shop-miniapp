import type { LooseT } from "@shop/core/i18n";
import { PRE_COLOR } from "@/components/preorder/colors";
import { etaWhen, holdUntilText, isLiveHold, type MyPreorder } from "@/lib/preorders";

export type RowStatus = MyPreorder["status"] | "EXPIRED";

/** A HELD place whose deadline has passed but the server has not swept yet reads as expired. */
export function rowStatus(p: MyPreorder): RowStatus {
  return p.status === "HELD" && !isLiveHold(p) ? "EXPIRED" : p.status;
}

/** The status line under the title and its colour. */
export function statusLine(p: MyPreorder, status: RowStatus, t: LooseT, tag: string): { line: string; color: string } {
  switch (status) {
    case "WAITING":
    case "NOTIFIED": {
      const pos = p.position != null ? t("preorder.status.waitingPos", { pos: p.position }) : t("preorder.status.waiting");
      return { line: [pos, etaWhen(p.eta, t, tag)].filter(Boolean).join(" · "), color: PRE_COLOR };
    }
    case "HELD":
      return { line: t("preorder.status.held", { t: holdUntilText(p.holdUntil!, tag) }), color: "var(--ok)" };
    case "BOUGHT":
      return { line: t("preorder.status.bought"), color: "var(--ok)" };
    case "EXPIRED":
      return { line: t("preorder.status.expired"), color: "var(--warn)" };
    default:
      return { line: t("preorder.status.cancelled"), color: "var(--faint)" };
  }
}
