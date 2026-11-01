"use client";

/**
 * Пульт розыгрыша Halloween 2026 — the stream remote inside the admin panel. Two draws side by side,
 * a card per round with the prize photos; a tap picks the visual and shows the round on the OBS scene,
 * «Начать» rolls it there (/hw/draw/stage.html,
 * a browser source with no buttons, following the event service over SSE). «Призы» sets the packs.
 * Data and draws are the event service's (lib/halloween-api); remove the page with the event.
 */
import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { hwDraw, HW_VISUALS, type HwPool, type HwScreen, type HwVisual } from "@/lib/halloween-api";
import { useHwShow } from "@/lib/use-hw-show";
import { useToast } from "@/lib/toast";
import { cn } from "@/lib/cn";
import { PageHeader } from "@/components/layout/PageHeader";
import { Tabs } from "@/components/ui/Tabs";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { useConfirm } from "@/components/ui/ConfirmModal";
import { PoolColumn, POOL_TITLE, type PoolActions } from "@/components/halloween/pult/PoolColumn";
import { SceneBar } from "@/components/halloween/pult/SceneBar";
import { ContactModal } from "@/components/halloween/pult/ContactModal";
import { PrizesPanel } from "@/components/halloween/pult/PrizesPanel";
import { VisualPicker, type PickTarget } from "@/components/halloween/pult/VisualPicker";

const VISUAL_KEY = "hw-pult-visual";
const POOLS: HwPool[] = ["pumpkins", "orders"];

function savedVisual(): HwVisual {
  try {
    const v = localStorage.getItem(VISUAL_KEY);
    return HW_VISUALS.some((x) => x.value === v) ? (v as HwVisual) : "roulette";
  } catch {
    return "roulette";
  }
}

type Pick = PickTarget & { pool: HwPool };

/** Draw actions of one pool: each irreversible one asks first (a roll: the visual picker), then refreshes the pult data. */
function usePoolActions(test: boolean, setBusy: (b: boolean) => void, setContact: (c: { pool: HwPool; round: number }) => void, setPick: (p: Pick) => void) {
  const qc = useQueryClient();
  const { push } = useToast();
  const [confirm, confirmNode] = useConfirm();

  const run = useCallback(async (action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
      await qc.invalidateQueries({ queryKey: ["hw-pult"] });
    } catch (e) {
      push(e instanceof Error ? e.message : "Не получилось", "error");
    } finally {
      setBusy(false);
    }
  }, [qc, push, setBusy]);

  const forPool = (pool: HwPool): PoolActions => ({
    pick: (round, visual, superPrize, prizeName) => setPick({ pool, round, prizeName, superPrize, current: visual }),
    start: (round, visual) => void run(() => hwDraw.draw(pool, test, round, visual)),
    cancel: () => void run(() => hwDraw.announce({ cancel: true })),
    async reroll(round, visual) {
      // In rehearsal too: one stray click would roll the scene at once, with no visual picker in between.
      const ok = await confirm(test
        ? { title: `Перекрутить тестовый раунд ${round}?`, message: "Сцена сразу начнёт крутить раунд заново.", confirmLabel: "Перекрутить" }
        : { title: `Перекрутить раунд ${round}?`, message: "Текущий победитель аннулируется (останется в журнале доказательства) и больше не участвует.", confirmLabel: "Перекрутить", danger: true });
      if (ok) await run(() => hwDraw.reroll(pool, test, visual));
    },
    async lock() {
      const ok = test || (await confirm({ title: "Зафиксировать список?", message: "После этого новые тыквы и заказы уже не добавят билетов. Первый розыгрыш фиксирует список сам.", confirmLabel: "Зафиксировать" }));
      if (ok) await run(() => hwDraw.lock(pool, test));
    },
    async resetRounds(played) {
      const ok = await confirm(test
        ? { title: "Сбросить тестовые раунды?", message: `${POOL_TITLE[pool]}: ${played} сыгранных раундов станут свободными. Участники те же.`, confirmLabel: "Сбросить" }
        : { title: "Сбросить НАСТОЯЩИЕ раунды?", message: `${POOL_TITLE[pool]}: все ${played} победителей аннулируются и вернутся в розыгрыш, раунды можно будет крутить заново (будут другие победители). Старые розыгрыши останутся в журнале доказательства.`, confirmLabel: "Да, сбросить", danger: true });
      if (ok) await run(() => hwDraw.resetRounds(pool, test));
    },
    testReset: () => void run(() => hwDraw.testReset(pool)),
    contact: (round) => setContact({ pool, round }),
  });
  const announce = (p: Pick, visual: string) => run(() => hwDraw.announce({ pool: p.pool, test, round: p.round, visual }));
  return { forPool, announce, confirmNode };
}

function Pult() {
  const qc = useQueryClient();
  const { show, stageKey, online } = useHwShow();
  const [test, setTest] = useState(false);
  const [visual, setVisual] = useState<HwVisual>("roulette");
  const [busy, setBusy] = useState(false);
  const [pool, setPool] = useState<HwPool>("pumpkins");
  const [contact, setContact] = useState<{ pool: HwPool; round: number } | null>(null);
  const [pick, setPick] = useState<Pick | null>(null);
  const { forPool, announce, confirmNode } = usePoolActions(test, setBusy, setContact, setPick);
  const closeContact = useCallback(() => setContact(null), []);
  const closePick = useCallback(() => setPick(null), []);

  useEffect(() => setVisual(savedVisual()), []);
  // The scene follows the remote's mode (rehearsal or the real draw).
  useEffect(() => void hwDraw.setShow({ test }).catch(() => {}), [test]);
  // A roll, a lock or a prize change anywhere bumps rev: reload what the cards show.
  const rev = show?.rev;
  useEffect(() => void qc.invalidateQueries({ queryKey: ["hw-pult"] }), [rev, qc]);

  const winnerName = (p: string, id: string) =>
    qc.getQueryData<HwScreen>(["hw-pult", "screen", p, test])?.participants.find((x) => x.id === id)?.name ?? null;

  return (
    <div className="flex flex-col gap-4">
      <SceneBar show={show} online={online} stageKey={stageKey} test={test} onTest={setTest} winnerName={winnerName} visual={visual}
        onVisual={(v) => {
          setVisual(v);
          try { localStorage.setItem(VISUAL_KEY, v); } catch { /* private mode: not remembered */ }
        }} />
      <SegmentedControl className="xl:hidden" value={pool} onChange={setPool} options={POOLS.map((p) => ({ value: p, label: POOL_TITLE[p] }))} />
      <div className={cn("grid gap-6 xl:grid-cols-2", test && "rounded-[var(--r-lg)] outline-dashed outline-2 outline-offset-8 outline-[var(--danger)]")}>
        {POOLS.map((p) => (
          <div key={p} className={cn(p !== pool && "max-xl:hidden")}>
            <PoolColumn pool={p} test={test} show={show} visual={visual} busy={busy} actions={forPool(p)} />
          </div>
        ))}
      </div>
      <VisualPicker target={pick} busy={busy} onClose={closePick}
        onPick={(v) => { if (pick) void announce(pick, v).then(closePick); }} />
      <ContactModal target={contact} test={test} onClose={closeContact} />
      {confirmNode}
    </div>
  );
}

export default function HalloweenPultPage() {
  const [tab, setTab] = useState<"pult" | "prizes">("pult");
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PageHeader title="Пульт розыгрыша 🎃" subtitle="Стрим 1 ноября: «Крутить» → режим (сцена покажет приз) → «Начать»: отсчёт и крутка на сцене OBS." />
      <Tabs value={tab} onChange={setTab} items={[{ value: "pult", label: "Пульт" }, { value: "prizes", label: "Призы" }]} />
      {tab === "pult" ? <Pult /> : <PrizesPanel />}
    </div>
  );
}
