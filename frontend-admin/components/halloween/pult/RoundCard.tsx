"use client";

/**
 * One round of the stream draw: the prize photos, the pack, and what can be done with the round now —
 * roll it, watch it roll on the OBS scene, or (played) see the winner, write to them, reroll the last one.
 */
import { MessageCircle, Play, RotateCcw, Sparkles, Trophy, X } from "lucide-react";
import { HW_VISUALS, type HwPrize } from "@/lib/halloween-api";
import { cn } from "@/lib/cn";
import { PrizePhoto, isPackPicture } from "./PrizePhoto";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";

/** `announced`: the lot and the visual are on the scene, waiting for «Начать». */
export type RoundState = { kind: "free" } | { kind: "announced"; visual: string } | { kind: "rolling" } | { kind: "won"; winner: string; canReroll: boolean };

const visualLabel = (v: string) => HW_VISUALS.find((x) => x.value === v)?.label ?? v;

function Photos({ prize, superPrize }: { prize: HwPrize | null; superPrize: boolean }) {
  const box = superPrize ? "aspect-[16/10] sm:w-[46%] sm:shrink-0 sm:aspect-auto sm:min-h-[200px]" : "aspect-[16/10]";
  const all = prize?.images ?? [];
  // a pack drawn as one scene says it all; otherwise up to four product photos
  const set = all.find(isPackPicture);
  const pics = set ? [set] : all.slice(0, 4);
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
        <PrizePhoto key={key} imageKey={key} size={360}
          className={cn("h-full w-full bg-[var(--surface-2)] object-cover", pics.length === 3 && i === 0 && "row-span-2")} />
      ))}
    </div>
  );
}

type Handlers = { onRoll: () => void; onStart: () => void; onCancel: () => void; onReroll: () => void; onContact: () => void };

/** What can be done with the round now. */
function Actions({ state, superPrize, disabled, on }: { state: RoundState; superPrize: boolean; disabled: boolean; on: Handlers }) {
  const { onRoll, onStart, onCancel, onReroll, onContact } = on;
  return (
    <>
      {state.kind === "free" && (
        <Button variant="accent" size="lg" chamfer icon={<Play className="h-4 w-4" />} disabled={disabled} onClick={onRoll}>
          {superPrize ? "Крутить суперприз" : "Крутить"}
        </Button>
      )}
      {state.kind === "announced" && (
        <>
          <div className="min-w-0 truncate text-[13px] font-semibold text-[var(--warn)]">На сцене · {visualLabel(state.visual)}</div>
          <div className="flex gap-2">
            <Button variant="accent" size="lg" chamfer className="min-w-0 flex-1" icon={<Play className="h-4 w-4" />} disabled={disabled} onClick={onStart}>Начать</Button>
            <Button size="lg" variant="surface" disabled={disabled} onClick={onRoll}>Режим</Button>
            <Button size="lg" variant="ghost" icon={<X className="h-4 w-4" />} title="Убрать раунд со сцены" aria-label="Отмена" disabled={disabled} onClick={onCancel} />
          </div>
        </>
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
    </>
  );
}

export function RoundCard({ round, prize, superPrize, state, disabled, ...on }: {
  round: number;
  prize: HwPrize | null;
  superPrize: boolean;
  state: RoundState;
  /** Another round is rolling or a request is on its way. */
  disabled: boolean;
  /** Opens the visual picker (also «Режим» to change it). */
  onRoll: () => void;
  onStart: () => void;
  onCancel: () => void;
  onReroll: () => void;
  onContact: () => void;
}) {
  return (
    <article
      className={cn(
        "card flex flex-col overflow-hidden p-0 transition-[border-color,box-shadow,opacity]",
        superPrize && "col-span-full border-[color-mix(in_srgb,var(--warn)_55%,transparent)] sm:flex-row",
        state.kind === "won" && "opacity-75",
        state.kind === "announced" && "border-[var(--warn)] shadow-[var(--glow)]",
        state.kind === "rolling" && "border-[var(--accent)] opacity-100 shadow-[var(--glow)]"
      )}
    >
      <Photos prize={prize} superPrize={superPrize} />
      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="section-title">Раунд {round}</span>
          {superPrize && <Badge tone="warn">⭐ Суперприз</Badge>}
        </div>
        <p className="font-display text-[15px] font-bold leading-tight">{prize?.name ?? "Приз не выбран"}</p>
        {prize && prize.items.length > 0 && (
          <ul className="list-disc pl-4 text-[12px] leading-snug text-[var(--text-muted)]">
            {prize.items.map((s) => <li key={s}>{s}</li>)}
          </ul>
        )}
        {/* one height for every state, so a winner does not make the row jump */}
        <div className="mt-auto flex min-h-[68px] flex-col justify-end gap-2 pt-1">
          <Actions state={state} superPrize={superPrize} disabled={disabled} on={on} />
        </div>
      </div>
    </article>
  );
}
