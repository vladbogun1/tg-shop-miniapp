import { Archive, ArchiveRestore, Merge, PackageCheck, Repeat, Undo2, WalletMinimal } from "lucide-react";
import type { OrderStatus } from "@shop/core/types";
import type { SheetAction } from "@/components/ui/ActionSheet";
import type { DrawerRules } from "../../model/drawer-rules";
import { STATUS_ACTION_LABEL } from "../../model/status";
import { ACTION_ICON, PAY_LABEL } from "./ActionBar";
import type { ModalName } from "./use-drawer-modals";

/** Пункты «⋯» на телефоне: всё, кроме главного шага. Без главного шага «Оплату» убирает вызывающий (она уже на панели). */
export function buildSheetActions(args: {
  rules: DrawerRules;
  canMerge: boolean;
  show: (name: ModalName) => void;
  requestStatus: (target: OrderStatus) => void;
  onUnarchive: () => void;
}): SheetAction[] {
  const { rules, canMerge, show, requestStatus, onUnarchive } = args;
  const actions: SheetAction[] = [
    {
      key: "pay",
      label: PAY_LABEL,
      icon: <WalletMinimal className="h-4 w-4" />,
      onSelect: () => show("pay"),
    },
    ...rules.targets
      .filter((t) => t !== rules.primary)
      .map((t) => {
        const Icon = ACTION_ICON[t as Exclude<OrderStatus, "NEW">];
        return {
          key: t,
          label: STATUS_ACTION_LABEL[t],
          icon: <Icon className="h-4 w-4" />,
          danger: t === "REJECTED",
          onSelect: () => requestStatus(t),
        };
      }),
  ];
  if (rules.canExchange)
    actions.push({
      key: "exchange",
      label: "Обмен",
      icon: <Repeat className="h-4 w-4" />,
      onSelect: () => show("exchange"),
    });
  if (canMerge)
    actions.push({
      key: "merge",
      label: "Объединить заказы",
      icon: <Merge className="h-4 w-4" />,
      onSelect: () => show("merge"),
    });
  if (rules.canReturn)
    actions.push({
      key: "return",
      label: "Возврат",
      icon: <Undo2 className="h-4 w-4" />,
      onSelect: () => show("return"),
    });
  if (rules.inTransit) {
    actions.push({
      key: "return-received",
      label: "Посылка вернулась",
      icon: <PackageCheck className="h-4 w-4" />,
      onSelect: () => show("received"),
    });
  }
  if (rules.canArchive) {
    actions.push({
      key: "archive",
      label: "В архив",
      icon: <Archive className="h-4 w-4" />,
      danger: true,
      onSelect: () => show("archive"),
    });
  }
  if (rules.canUnarchive) {
    actions.push({
      key: "unarchive",
      label: "Вернуть из архива",
      icon: <ArchiveRestore className="h-4 w-4" />,
      onSelect: onUnarchive,
    });
  }
  return actions;
}
