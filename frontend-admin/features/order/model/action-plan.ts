/**
 * Панель действий карточки заказа: что главное, что в меню «Ещё» и в каких группах (чистые правила, без React).
 * Условия показа берутся из drawerRules (матрица «статус × роль × архив → действия»), здесь только раскладка:
 * главное по шагу статуса, «Отклонить» отдельной кнопкой, остальное — по группам Деньги / Заказ / Архив.
 */
import type { OrderStatus } from "@shop/core/types";
import type { DrawerRules } from "./drawer-rules";

export type PlanKey =
  | "pay"
  | "return"
  | "merge"
  | "exchange"
  | "received"
  | "newOrder"
  | "archive"
  | "unarchive"
  | `status:${OrderStatus}`;

export type PlanGroupId = "money" | "order" | "archive";

export interface PlanGroup {
  id: PlanGroupId;
  title: string;
  keys: PlanKey[];
}

export interface ActionPlan {
  /** Главная кнопка: шаг статуса; без шага — «Посылка вернулась» / «Оформить возврат» / «Написать клиенту». */
  primary: PlanKey | "chat";
  /** «Отклонить» стоит на панели отдельно (на телефоне — в меню). */
  reject: boolean;
  groups: PlanGroup[];
}

export const GROUP_TITLE: Record<PlanGroupId, string> = {
  money: "Деньги",
  order: "Заказ",
  archive: "Архив",
};

function pickPrimary(rules: DrawerRules): ActionPlan["primary"] {
  if (rules.inTransit) return "received";
  if (rules.primary) return `status:${rules.primary}`;
  return rules.canReturn ? "return" : "chat";
}

export function actionPlan(rules: DrawerRules, canMerge: boolean): ActionPlan {
  const primary = pickPrimary(rules);

  const money: PlanKey[] = ["pay"];
  if (rules.canReturn && primary !== "return") money.push("return");

  const order: PlanKey[] = [];
  // Прямой шаг мимо главного (NEW → «Отправить» при главном «Одобрить»).
  for (const t of rules.targets) {
    if (t !== "REJECTED" && `status:${t}` !== primary) order.push(`status:${t}`);
  }
  if (canMerge) order.push("merge");
  if (rules.canExchange) order.push("exchange");
  if (rules.inTransit && primary !== "received") order.push("received");
  // «Новый заказ этому покупателю»: из любого заказа — покупатель и адрес переносятся в окно ручного заказа.
  order.push("newOrder");
  const reject = rules.targets.includes("REJECTED");
  if (reject) order.push("status:REJECTED");

  const archive: PlanKey[] = [];
  if (rules.canArchive) archive.push("archive");
  if (rules.canUnarchive) archive.push("unarchive");

  return {
    primary,
    reject,
    groups: (
      [
        { id: "money", title: GROUP_TITLE.money, keys: money },
        { id: "order", title: GROUP_TITLE.order, keys: order },
        { id: "archive", title: GROUP_TITLE.archive, keys: archive },
      ] satisfies PlanGroup[]
    ).filter((g) => g.keys.length > 0),
  };
}
