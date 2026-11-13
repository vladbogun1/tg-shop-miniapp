import {
  BellDot,
  ClipboardList,
  Globe,
  Hourglass,
  LifeBuoy,
  MessageCircle,
  Package,
  PackageCheck,
  PackageMinus,
  PackageX,
  RefreshCw,
  Settings,
  Star,
  Truck,
  Undo2,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { CSSProperties } from "react";
import { goingBackOf, isRefundRow, knownType } from "../model/inbox";
import type { InboxItem, InboxType, KnownInboxType } from "../model/types";

const GROUP_ICON: Record<KnownInboxType, LucideIcon> = {
  PAYMENT: Wallet,
  APPROVED_UNPAID: Wallet,
  CHAT: MessageCircle,
  NEW_STALE: Hourglass,
  APPROVED_STALE: Truck,
  RETURN: Undo2,
  LOW_STOCK: PackageMinus,
  SITE_ERROR: Globe,
  REVIEW: Star,
  SUPPORT: LifeBuoy,
  SUPPLY_DRAFT: PackageCheck,
  PARCEL: PackageX,
  NP_SYSTEM: Truck,
};

/** Group hue (icon tile tint, icon, count): money and people first, information last. */
const GROUP_TONE: Record<KnownInboxType, string> = {
  PAYMENT: "var(--ok)",
  APPROVED_UNPAID: "var(--danger)",
  CHAT: "var(--accent-hi)",
  NEW_STALE: "var(--st-new)",
  APPROVED_STALE: "var(--st-approved)",
  RETURN: "var(--st-rejected)",
  LOW_STOCK: "var(--warn)",
  SITE_ERROR: "var(--text-muted)",
  REVIEW: "var(--accent)",
  SUPPORT: "var(--info)",
  SUPPLY_DRAFT: "var(--accent)",
  PARCEL: "var(--warn)",
  NP_SYSTEM: "var(--danger)",
};

export function groupIcon(type: InboxType): LucideIcon {
  const k = knownType(type);
  return k ? GROUP_ICON[k] : BellDot;
}

export function groupTone(type: InboxType): string {
  const k = knownType(type);
  return k ? GROUP_TONE[k] : "var(--text-muted)";
}

/** Tinted tile in a group hue (v3: colour at 14% + hairline at 30%, icon in the colour). */
export function toneTile(tone: string): CSSProperties {
  return {
    color: tone,
    background: `color-mix(in srgb, ${tone} 14%, transparent)`,
    borderColor: `color-mix(in srgb, ${tone} 30%, transparent)`,
  };
}

interface PrimaryAction {
  label: string;
  icon: LucideIcon;
}

const OPEN_ORDER: PrimaryAction = { label: "Открыть заказ", icon: ClipboardList };
const REFUND: PrimaryAction = { label: "Вернуть деньги", icon: Undo2 };
const GOING_BACK: PrimaryAction = { label: "Едет назад", icon: Truck };

const PRIMARY: Record<KnownInboxType, PrimaryAction> = {
  PAYMENT: OPEN_ORDER,
  APPROVED_UNPAID: OPEN_ORDER,
  CHAT: { label: "Ответить", icon: MessageCircle },
  NEW_STALE: OPEN_ORDER,
  APPROVED_STALE: OPEN_ORDER,
  RETURN: OPEN_ORDER,
  LOW_STOCK: { label: "Открыть товар", icon: Package },
  SITE_ERROR: { label: "Повторить", icon: RefreshCw },
  REVIEW: { label: "К отзывам", icon: Star },
  SUPPORT: { label: "Ответить", icon: MessageCircle },
  SUPPLY_DRAFT: { label: "Открыть черновик", icon: PackageCheck },
  PARCEL: OPEN_ORDER,
  NP_SYSTEM: { label: "К настройкам", icon: Settings },
};

/** Main action of a row; a kind the UI does not know yet opens its order (if it has one). */
export function primaryOf(item: InboxItem): PrimaryAction {
  if (isRefundRow(item)) return REFUND;
  if (goingBackOf(item)) return GOING_BACK;
  const known = knownType(item.type);
  return known ? PRIMARY[known] : OPEN_ORDER;
}
