"use client";

/**
 * Нижняя панель карточки заказа: на ПК все действия, на телефоне одно главное по статусу и «⋯».
 * ONE solid-orange action per view: the next happy-path step; the rest are surface/danger.
 * The manual payment correction is never the main action — payments come in online.
 */
import { Archive, ArchiveRestore, Ban, Check, MoreHorizontal, PackageCheck, Send, WalletMinimal } from "lucide-react";
import type { OrderStatus } from "@shop/core/types";
import { Button } from "@shop/ui/admin-button";
import { cn } from "@/lib/cn";
import type { DrawerRules } from "../../model/drawer-rules";
import { STATUS_ACTION_LABEL } from "../../model/status";
import type { ModalName } from "./use-drawer-modals";

export const ACTION_ICON: Record<Exclude<OrderStatus, "NEW">, typeof Check> = {
  APPROVED: Check,
  SHIPPED: Send,
  DELIVERED: PackageCheck,
  REJECTED: Ban,
};

/** Payments arrive online (monobank); this is only a manual correction (наложка, a mistake). */
export const PAY_LABEL = "Скорректировать оплату";

export interface ActionBarProps {
  rules: DrawerRules;
  busyKey: string | null;
  isDesktop: boolean;
  show: (name: ModalName) => void;
  requestStatus: (target: OrderStatus) => void;
  onUnarchive: () => void;
}

type ButtonsProps = Omit<ActionBarProps, "isDesktop" | "onUnarchive">;

function StatusButton({
  target,
  rules,
  busyKey,
  requestStatus,
  primary,
  full,
}: ButtonsProps & { target: OrderStatus; primary?: boolean; full?: boolean }) {
  const Icon = ACTION_ICON[target as Exclude<OrderStatus, "NEW">];
  const key = `status:${target}`;
  return (
    <Button
      size={primary ? "md" : "sm"}
      variant={target === "REJECTED" ? "danger" : primary || rules.primary === target ? "accent" : "surface"}
      loading={busyKey === key}
      disabled={!!busyKey && busyKey !== key}
      icon={<Icon className="h-4 w-4" />}
      className={cn(full && "flex-1")}
      onClick={() => requestStatus(target)}
    >
      {STATUS_ACTION_LABEL[target]}
    </Button>
  );
}

function PayButton({ busyKey, show, full }: Pick<ButtonsProps, "busyKey" | "show"> & { full?: boolean }) {
  return (
    <Button
      size={full ? "md" : "sm"}
      variant="surface"
      loading={busyKey === "pay"}
      disabled={!!busyKey && busyKey !== "pay"}
      className={cn(full && "flex-1")}
      icon={<WalletMinimal className="h-4 w-4" />}
      onClick={() => show("pay")}
    >
      {PAY_LABEL}
    </Button>
  );
}

function ArchiveButtons({ rules, busyKey, show, onUnarchive }: Pick<ActionBarProps, "rules" | "busyKey" | "show" | "onUnarchive">) {
  return (
    <>
      {rules.canArchive && (
        <Button
          size="sm"
          variant="surface"
          className="ml-auto"
          loading={busyKey === "archive"}
          disabled={!!busyKey && busyKey !== "archive"}
          icon={<Archive className="h-4 w-4" />}
          onClick={() => show("archive")}
        >
          В архив
        </Button>
      )}
      {rules.canUnarchive && (
        <Button
          size="sm"
          variant="surface"
          className="ml-auto"
          loading={busyKey === "unarchive"}
          disabled={!!busyKey && busyKey !== "unarchive"}
          icon={<ArchiveRestore className="h-4 w-4" />}
          onClick={onUnarchive}
        >
          Вернуть из архива
        </Button>
      )}
    </>
  );
}

export function ActionBar(props: ActionBarProps) {
  const { rules, busyKey, isDesktop, show, onUnarchive } = props;
  if (isDesktop) {
    return (
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-[var(--line)] bg-[var(--bg-2)] px-5 py-3.5">
        <PayButton busyKey={busyKey} show={show} />
        {rules.targets.map((t) => (
          <StatusButton key={t} {...props} target={t} />
        ))}
        {rules.inTransit && (
          <Button
            size="sm"
            variant="accent"
            icon={<PackageCheck className="h-4 w-4" />}
            disabled={!!busyKey}
            onClick={() => show("received")}
          >
            Посылка вернулась
          </Button>
        )}
        <ArchiveButtons rules={rules} busyKey={busyKey} show={show} onUnarchive={onUnarchive} />
      </div>
    );
  }
  return (
    <div
      className="flex shrink-0 items-center gap-2 border-t border-[var(--line)] bg-[var(--bg-2)] px-4 pt-3"
      style={{ paddingBottom: "calc(12px + var(--safe-bottom, 0px))" }}
    >
      {rules.primary ? <StatusButton {...props} target={rules.primary} primary full /> : <PayButton busyKey={busyKey} show={show} full />}
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
