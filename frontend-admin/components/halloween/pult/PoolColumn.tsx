"use client";

/**
 * One draw on the remote (pumpkins or purchases): its stats, the list lock and a card per round.
 * A tap on a card asks once and rolls that round on the OBS scene. Rounds can go in any order;
 * the draw stays fair because each pick depends only on the seed and the round number.
 */
import { useQuery } from "@tanstack/react-query";
import { Lock, Users } from "lucide-react";
import { hwDraw, HW_SUPER_VISUAL, type HwPool, type HwPrizes, type HwScreen, type HwShow } from "@/lib/halloween-api";
import { playingRoll } from "@/lib/use-hw-show";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { QueryState } from "@/components/ui/QueryState";
import { RoundCard, type RoundState } from "./RoundCard";

export const POOL_TITLE: Record<HwPool, string> = { pumpkins: "🎃 Розыгрыш за тыквы", orders: "🛍 Розыгрыш за покупки" };

/** What a draw action needs from the page: it asks, sends and refreshes. */
export interface PoolActions {
  roll: (round: number, visual: string, superPrize: boolean, prizeName: string) => void;
  reroll: (round: number, visual: string) => void;
  lock: () => void;
  testReset: () => void;
  contact: (round: number) => void;
}

export const usePoolData = (pool: HwPool, test: boolean) => ({
  screen: useQuery({ queryKey: ["hw-pult", "screen", pool, test], queryFn: () => hwDraw.screen(pool, test), refetchInterval: 30_000 }),
  prizes: useQuery({ queryKey: ["hw-pult", "prizes", pool], queryFn: () => hwDraw.prizes(pool) }),
});

const prizeOf = (pz: HwPrizes | undefined, round: number) => pz?.prizes.find((p) => p.id === pz.rounds[round]) ?? null;

function stateOf(d: HwScreen, round: number, rolling: boolean): RoundState {
  if (rolling) return { kind: "rolling" };
  const win = d.winners.find((w) => w.round === round);
  if (!win) return { kind: "free" };
  const who = d.participants.find((p) => p.id === win.participantId);
  return { kind: "won", winner: who?.name ?? "победитель", canReroll: d.winners[d.winners.length - 1]?.round === round };
}

function Head({ d, test, busy, actions }: { d: HwScreen; test: boolean; busy: boolean; actions: PoolActions }) {
  const left = d.participants.filter((p) => !p.won);
  const tickets = left.reduce((s, p) => s + p.tickets, 0);
  return (
    <div className="flex flex-wrap items-center gap-2 text-[13px] text-[var(--text-muted)]">
      <span className="inline-flex items-center gap-1"><Users className="h-4 w-4" /> {d.participants.length}</span>
      <span>· билетов в игре {tickets}</span>
      <span>· сыграно {d.winners.length}/{d.rounds}</span>
      {d.seedHash ? (
        <Badge tone="ok" className="font-mono normal-case" dot>sha256 {d.seedHash.slice(0, 12)}…</Badge>
      ) : (
        <Button size="sm" variant="outline" icon={<Lock className="h-4 w-4" />} disabled={busy} onClick={actions.lock}>Зафиксировать список</Button>
      )}
      {test && <Button size="sm" variant="ghost" disabled={busy} onClick={actions.testReset}>Новые тестовые участники</Button>}
    </div>
  );
}

export function PoolColumn({ pool, test, show, visual, busy, actions }: {
  pool: HwPool;
  test: boolean;
  show: HwShow | null;
  /** Visual of the ordinary rounds; the super prize plays the knights. */
  visual: string;
  /** A request is on its way. */
  busy: boolean;
  actions: PoolActions;
}) {
  const { screen, prizes } = usePoolData(pool, test);
  const d = screen.data;
  const rolling = playingRoll(show, pool, test);
  const anyRolling = Boolean(show && (playingRoll(show, "pumpkins", test) || playingRoll(show, "orders", test)));
  const blocked = busy || anyRolling || !d?.participants.some((p) => !p.won);

  return (
    <section className="flex min-w-0 flex-col gap-3">
      <h2 className="page-title text-[20px]">{POOL_TITLE[pool]}</h2>
      {screen.isError ? (
        <QueryState isLoading={false} isError error={screen.error} refetch={screen.refetch}>{null}</QueryState>
      ) : !d ? (
        <Skeleton className="h-[600px]" />
      ) : (
        <>
          <Head d={d} test={test} busy={busy} actions={actions} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-3">
            {Array.from({ length: d.rounds }, (_, i) => i + 1).map((round) => {
              const prize = prizeOf(prizes.data, round);
              const superPrize = round === d.rounds || /суперприз/i.test(prize?.name ?? "");
              const v = superPrize ? HW_SUPER_VISUAL : visual;
              return (
                <RoundCard key={round} round={round} prize={prize} superPrize={superPrize}
                  state={stateOf(d, round, rolling?.round === round)} disabled={blocked}
                  onRoll={() => actions.roll(round, v, superPrize, prize?.name ?? "")}
                  onReroll={() => actions.reroll(round, v)} onContact={() => actions.contact(round)} />
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
