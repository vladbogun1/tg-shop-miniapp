"use client";

/**
 * Нижняя панель карточки заказа. ПК: главный шаг (accent) + «Отклонить» + «⋯ Ещё» с группами Деньги / Заказ / Архив.
 * Телефон: главная кнопка на всю ширину + «⋯» (лист с теми же группами). Раскладка — model/action-plan.ts.
 * Нет шага статуса: «Посылка вернулась» / «Оформить возврат» / «Написать клиенту» (переключает на чат).
 * ONE solid-orange action per view; ручная корректировка оплаты никогда не главная.
 */
import { MoreHorizontal } from "lucide-react";
import type { OrderStatus } from "@shop/core/types";
import { Button } from "@shop/ui/admin-button";
import { cn } from "@/lib/cn";
import { actionPlan, type PlanKey } from "../../model/action-plan";
import type { DrawerRules } from "../../model/drawer-rules";
import { actionMeta, busyKeyOf } from "./action-meta";
import { MoreMenu } from "./MoreMenu";
import { buildMenuGroups, runPlanKey } from "./sheet-actions";
import type { ModalName } from "./use-drawer-modals";

export interface ActionBarProps {
  rules: DrawerRules;
  canMerge: boolean;
  busyKey: string | null;
  isDesktop: boolean;
  show: (name: ModalName) => void;
  requestStatus: (target: OrderStatus) => void;
  onUnarchive: () => void;
  /** «Написать клиенту» — переключает карточку на чат. */
  onChat: () => void;
}

function PlanButton({
  planKey,
  props,
  primary,
  full,
}: {
  planKey: PlanKey | "chat";
  props: ActionBarProps;
  primary?: boolean;
  full?: boolean;
}) {
  const { busyKey, onChat } = props;
  const meta = actionMeta(planKey);
  const key = busyKeyOf(planKey);
  const accent = primary && planKey !== "chat";
  return (
    <Button
      size={full ? "md" : "sm"}
      variant={meta.danger ? "danger" : accent ? "accent" : "surface"}
      loading={!!key && busyKey === key}
      disabled={!!busyKey && busyKey !== key}
      icon={meta.icon}
      className={cn(full && "flex-1")}
      onClick={() => (planKey === "chat" ? onChat() : runPlanKey(planKey, props))}
    >
      {meta.label}
    </Button>
  );
}

export function ActionBar(props: ActionBarProps) {
  const { rules, canMerge, busyKey, isDesktop, show } = props;
  const plan = actionPlan(rules, canMerge);

  if (isDesktop) {
    const groups = buildMenuGroups({ ...props, withReject: false });
    return (
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-[var(--line)] bg-[var(--bg-2)] px-5 py-3.5">
        <PlanButton planKey={plan.primary} props={props} primary />
        {plan.reject && <PlanButton planKey="status:REJECTED" props={props} />}
        <MoreMenu groups={groups} busyKey={busyKey} />
      </div>
    );
  }
  return (
    <div
      className="flex shrink-0 items-center gap-2 border-t border-[var(--line)] bg-[var(--bg-2)] px-4 pt-3"
      style={{ paddingBottom: "calc(12px + var(--safe-bottom, 0px))" }}
    >
      <PlanButton planKey={plan.primary} props={props} primary full />
      <Button
        size="md"
        variant="surface"
        aria-label="Другие действия"
        icon={<MoreHorizontal className="h-5 w-5" />}
        onClick={() => show("more")}
      />
    </div>
  );
}
