import { Archive, ArchiveRestore, Ban, Check, MessageSquare, Merge, PackageCheck, Repeat, Send, ShoppingBag, Undo2, WalletMinimal } from "lucide-react";
import type { ReactNode } from "react";
import type { OrderStatus } from "@shop/core/types";
import type { PlanKey } from "../../model/action-plan";
import { STATUS_ACTION_LABEL } from "../../model/status";

export const ACTION_ICON: Record<Exclude<OrderStatus, "NEW">, typeof Check> = {
  APPROVED: Check,
  SHIPPED: Send,
  DELIVERED: PackageCheck,
  REJECTED: Ban,
};

/** Payments arrive online (monobank); this is only a manual correction (наложка, a mistake). */
export const PAY_LABEL = "Скорректировать оплату";

const ICON_CLASS = "h-4 w-4";

/** Подпись, иконка и признак «опасное» каждого действия панели (общие для кнопки и пункта меню). */
export function actionMeta(key: PlanKey | "chat"): {
  label: string;
  icon: ReactNode;
  danger: boolean;
} {
  if (key.startsWith("status:")) {
    const target = key.slice("status:".length) as Exclude<OrderStatus, "NEW">;
    const Icon = ACTION_ICON[target] ?? Check;
    return {
      label: STATUS_ACTION_LABEL[target],
      icon: <Icon className={ICON_CLASS} />,
      danger: target === "REJECTED",
    };
  }
  switch (key) {
    case "pay":
      return {
        label: PAY_LABEL,
        icon: <WalletMinimal className={ICON_CLASS} />,
        danger: false,
      };
    case "return":
      return {
        label: "Оформить возврат",
        icon: <Undo2 className={ICON_CLASS} />,
        danger: false,
      };
    case "merge":
      return {
        label: "Объединить заказы",
        icon: <Merge className={ICON_CLASS} />,
        danger: false,
      };
    case "exchange":
      return {
        label: "Обмен",
        icon: <Repeat className={ICON_CLASS} />,
        danger: false,
      };
    case "received":
      return {
        label: "Посылка вернулась",
        icon: <PackageCheck className={ICON_CLASS} />,
        danger: false,
      };
    case "newOrder":
      return {
        label: "Новый заказ этому покупателю",
        icon: <ShoppingBag className={ICON_CLASS} />,
        danger: false,
      };
    case "archive":
      return {
        label: "В архив",
        icon: <Archive className={ICON_CLASS} />,
        danger: true,
      };
    case "unarchive":
      return {
        label: "Вернуть из архива",
        icon: <ArchiveRestore className={ICON_CLASS} />,
        danger: false,
      };
    default:
      return {
        label: "Написать клиенту",
        icon: <MessageSquare className={ICON_CLASS} />,
        danger: false,
      };
  }
}

/** Ключ занятости (`busyKey`) действия: по нему кнопка показывает спиннер, остальные блокируются. */
export function busyKeyOf(key: PlanKey | "chat"): string | null {
  switch (key) {
    case "pay":
      return "pay";
    case "archive":
      return "archive";
    case "unarchive":
      return "unarchive";
    case "received":
      return "return-received";
    case "chat":
    case "return":
    case "merge":
    case "exchange":
    case "newOrder":
      return null;
    default:
      return key;
  }
}
