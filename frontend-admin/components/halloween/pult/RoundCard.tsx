"use client";

/**
 * One round of the stream draw: the prize photos, the pack, and what can be done with the round now —
 * roll it, watch it roll on the OBS scene, or (played) see the winner, write to them, reroll the last one.
 */
import { MessageCircle, Play, RotateCcw, Sparkles, Trophy } from "lucide-react";
import type { HwPrize } from "@/lib/halloween-api";
import { cn } from "@/lib/cn";
import { Image } from "@/lib/image";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";

export type RoundState = { kind: "free" } | { kind: "rolling" } | { kind: "won"; winner: string; canReroll: boolean };

function Photos({ prize, superPrize }: { prize: HwPrize | null; superPrize: boolean }) {
  const box = superPrize ? "aspect-[16/10] sm:w-[46%] sm:shrink-0 sm:aspect-auto sm:min-h-[200px]" : "aspect-[16/10]";
  const pics = (prize?.images ?? []).slice(0, 4);
  if (!pics.length) {
    return (
      <div className={cn("flex items-center justify-center bg-[var(--surface-2)] text-[var(--text-faint)]", box)}>
        {superPrize ? <Sparkles className="h-10 w-10" /> : <Trophy className="h-10 w-10" />}
      </div>
    );
  }
  return (
    <div className={cn("grid gap-px bg-[var(--line)]", box, pics.length > 1 && "grid-cols-2", pics.length > 2 && "grid-rows-2")}>
      {pics.map((key, i) => (
        <Image key={key} imageKey={key} alt="" size={360}
          className={cn("h-full w-full bg-[var(--surface-2)] object-cover", pics.length === 3 && i === 0 && "row-span-2")} />
      ))}
    </div>
  );
}

export function RoundCard({ round, prize, superPrize, state, disabled, onRoll, onReroll, onContact }: {
  round: number;
  prize: HwPrize | null;
  superPrize: boolean;
  state: RoundState;
  /** Another round is rolling or a request is on its way. */
  disabled: boolean;
  onRoll: () => void;
  onReroll: () => void;
  onContact: () => void;
}) {
  return (
    <article
      className={cn(
        "card flex flex-col overflow-hidden p-0 transition-[border-color,box-shadow,opacity]",
        superPrize && "col-span-full border-[color-mix(in_srgb,var(--warn)_55%,transparent)] sm:flex-row",
        state.kind === "won" && "opacity-75",
        state.kind === "rolling" && "border-[var(--accent)] opacity-100 shadow-[var(--glow)]"
      )}
    >
      <Photos prize={prize} superPrize={superPrize} />
      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="section-title">Раунд {round}</span>
          {superPrize && <Badge tone="warn">⭐ Суперприз · рыцари</Badge>}
        </div>
        <p className="font-display text-[15px] font-bold leading-tight">{prize?.name ?? "Приз не выбран"}</p>
        {prize && prize.items.length > 0 && (
          <ul className="list-disc pl-4 text-[12px] leading-snug text-[var(--text-muted)]">
            {prize.items.map((s) => <li key={s}>{s}</li>)}
          </ul>
        )}
        {/* one height for every state, so a winner does not make the row jump */}
        <div className="mt-auto flex min-h-[68px] flex-col justify-end gap-2 pt-1">
          {state.kind === "free" && (
            <Button variant="accent" size="lg" chamfer icon={<Play className="h-4 w-4" />} disabled={disabled} onClick={onRoll}>
              {superPrize ? "Крутить суперприз" : "Крутить"}
            </Button>
          )}
          {state.kind === "rolling" && (
            <div className="flex items-center gap-2 font-semibold text-[var(--accent-hi)]"><Spinner /> Крутится на сцене…</div>
          )}
          {state.kind === "won" && (
            <>
              <div className="flex min-w-0 items-center gap-2 font-semibold text-[var(--ok)]"><Trophy className="h-4 w-4 shrink-0" /> <span className="min-w-0 truncate">{state.winner}</span></div>
              <div className="flex gap-2">
                <Button size="sm" variant="surface" className="min-w-0 flex-1" icon={<MessageCircle className="h-4 w-4" />} onClick={onContact}>Написать</Button>
                {state.canReroll && (
                  <Button size="sm" variant="danger" icon={<RotateCcw className="h-4 w-4" />} title="Перекрутить: победитель аннулируется"
                    aria-label="Перекрутить" disabled={disabled} onClick={onReroll} />
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </article>
  );
}
