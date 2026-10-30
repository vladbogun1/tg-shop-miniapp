"use client";

/**
 * Участники акции Halloween 2026 — the regular-admin view of the event (the stream screen /hw/draw/ stays
 * for the draw itself). Totals, the bot broadcast and one table of everyone with pumpkins, purchases,
 * tickets and chances. A row opens the shop profile (UserProfileDrawer), an order in it opens on top.
 * Data comes from the event service (lib/halloween-api); remove the page with the event.
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Users as UsersIcon, Ghost, Trophy, ShoppingBag, Wallet, UserX } from "lucide-react";
import { adminApi, type UserCardDto } from "@/lib/api";
import { hwApi, type HwMember } from "@/lib/halloween-api";
import { CHART_COLORS, moneyShort } from "@/lib/metrics-format";
import { useToast } from "@/lib/toast";
import { staggerContainer } from "@/lib/motion";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { QueryState } from "@/components/ui/QueryState";
import { Skeleton } from "@/components/ui/Skeleton";
import { useConfirm } from "@/components/ui/ConfirmModal";
import { UserProfileDrawer } from "@/components/users/UserProfileDrawer";
import { OrderDrawer } from "@/components/orders/OrderDrawer";
import { BroadcastPanel } from "@/components/halloween/BroadcastPanel";
import { MembersTable } from "@/components/halloween/MembersTable";
import { displayName } from "@/components/halloween/member-view";

export default function HalloweenPage() {
  const qc = useQueryClient();
  const { push } = useToast();
  const [confirm, confirmNode] = useConfirm();
  const [profileUser, setProfileUser] = useState<UserCardDto | null>(null);
  const [openOrderId, setOpenOrderId] = useState<string | null>(null);
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["hw-members"],
    queryFn: hwApi.members,
    refetchInterval: 30_000,
  });

  async function open(m: HwMember) {
    try {
      const found = await adminApi.users({ q: m.tgId, size: 5 });
      const u = found.find((x) => String(x.telegramUserId) === m.tgId);
      if (u) setProfileUser(u);
      else push("Этого человека нет в базе магазина", "error");
    } catch (e) {
      push(e instanceof Error ? e.message : "Не получилось открыть профиль", "error");
    }
  }

  async function toggleExclude(m: HwMember) {
    const pool = m.pumpkinTickets > 0 ? "pumpkins" : "orders";
    const out = m.excluded !== null;
    const ok = await confirm(out
      ? { title: `Вернуть ${displayName(m)}?`, message: "Снова будет участвовать в обоих розыгрышах.", confirmLabel: "Вернуть" }
      : { title: `Исключить ${displayName(m)}?`, message: "Не попадёт ни в розыгрыш тыкв, ни в розыгрыш покупок. Можно вернуть, пока списки не зафиксированы.", confirmLabel: "Исключить", danger: true });
    if (!ok) return;
    try {
      if (out) await hwApi.include(pool, m.tgId);
      else await hwApi.exclude(pool, m.tgId, "из админки");
      push(out ? "Вернули" : "Исключили", "ok");
      await qc.invalidateQueries({ queryKey: ["hw-members"] });
    } catch (e) {
      push(e instanceof Error ? e.message : "Не получилось", "error");
    }
  }

  const s = data?.summary;
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader title="Участники акции 🎃" subtitle="Хеллоуин 2026: тыквы, покупки, билеты и рассылка" />

      {isError ? (
        <QueryState isLoading={false} isError error={error} refetch={refetch}>{null}</QueryState>
      ) : (
        <>
          {s ? (
            <motion.div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6" variants={staggerContainer} initial="initial" animate="animate">
              <StatCard label="Участников" rawValue={s.total} icon={UsersIcon} />
              <StatCard label="Ловят тыквы" rawValue={s.pumpkinPeople} icon={Ghost} accent={CHART_COLORS.accent}
                hint={`собрано ${s.pumpkinsCollected}`} />
              <StatCard label={`Собрали все ${data.rules.goal}`} rawValue={s.fullSets} icon={Trophy} accent="var(--warn)" />
              <StatCard label="В розыгрыше покупок" rawValue={s.orderPeople} icon={ShoppingBag} accent={CHART_COLORS.delivered} />
              <StatCard label="Сумма за акцию" value={moneyShort(s.spendMinor)} icon={Wallet} accent={CHART_COLORS.delivered} />
              <StatCard label="Заблокировали бота" rawValue={s.blocked} icon={UserX} accent={CHART_COLORS.rejected} />
            </motion.div>
          ) : (
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
              {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-[104px]" />)}
            </div>
          )}

          <BroadcastPanel members={data} />

          {isLoading || !data ? <Skeleton className="h-[480px]" /> : (
            <MembersTable data={data} actions={{ onOpen: (m) => void open(m), onToggleExclude: (m) => void toggleExclude(m) }} />
          )}
        </>
      )}

      <UserProfileDrawer user={profileUser} onClose={() => setProfileUser(null)} onOpenOrder={setOpenOrderId} />
      {/* After the profile drawer, so it stacks above it. */}
      <OrderDrawer orderId={openOrderId} onClose={() => setOpenOrderId(null)} />
      {confirmNode}
    </div>
  );
}
