import type { OrderStatus } from "@shop/core/types";
import type { DrawerRules } from "../../model/drawer-rules";
import { actionPlan, type PlanKey } from "../../model/action-plan";
import { actionMeta, busyKeyOf } from "./action-meta";
import type { ModalName } from "./use-drawer-modals";

export interface MenuItem {
  key: PlanKey;
  label: string;
  icon: React.ReactNode;
  danger: boolean;
  busyKey: string | null;
  onSelect: () => void;
}

export interface MenuGroup {
  id: string;
  title: string;
  items: MenuItem[];
}

export interface ActionHandlers {
  show: (name: ModalName) => void;
  requestStatus: (target: OrderStatus) => void;
  onUnarchive: () => void;
}

/** Что делает действие панели: открывает окно, запускает смену статуса или «Вернуть из архива». */
export function runPlanKey(key: PlanKey, { show, requestStatus, onUnarchive }: ActionHandlers): void {
  if (key.startsWith("status:")) return requestStatus(key.slice("status:".length) as OrderStatus);
  switch (key) {
    case "pay":
      return show("pay");
    case "return":
      return show("return");
    case "merge":
      return show("merge");
    case "exchange":
      return show("exchange");
    case "received":
      return show("received");
    case "newOrder":
      return show("newOrder");
    case "archive":
      return show("archive");
    case "unarchive":
      return onUnarchive();
  }
}

/**
 * Группы меню «Ещё» (Деньги / Заказ / Архив) — то же на ПК (поповер) и на телефоне (лист).
 * `withReject`: на телефоне «Отклонить» живёт в меню, на ПК — отдельной кнопкой панели.
 */
export function buildMenuGroups(
  args: {
    rules: DrawerRules;
    canMerge: boolean;
    withReject: boolean;
  } & ActionHandlers,
): MenuGroup[] {
  const plan = actionPlan(args.rules, args.canMerge);
  return plan.groups
    .map((g) => ({
      id: g.id,
      title: g.title,
      items: g.keys
        .filter((k) => args.withReject || k !== "status:REJECTED")
        .map((key): MenuItem => ({
          key,
          ...actionMeta(key),
          busyKey: busyKeyOf(key),
          onSelect: () => runPlanKey(key, args),
        })),
    }))
    .filter((g) => g.items.length > 0);
}
