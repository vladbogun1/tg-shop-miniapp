"use client";

/**
 * Step one of a round: Maxim picks the visual it plays with. A tap puts the round's lot and that visual on
 * the OBS scene (announce); nothing is drawn until «Начать» on the card. Stills: draw/assets/previews.
 */
import { useState } from "react";
import { Check } from "lucide-react";
import { HW_VISUALS, hwVisualPreview } from "@/lib/halloween-api";
import { cn } from "@/lib/cn";
import { Modal } from "@/components/ui/Modal";

export interface PickTarget {
  round: number;
  prizeName: string;
  superPrize: boolean;
  /** Preselected: the remote's visual, the knights for the super prize, or what is on the scene now. */
  current: string;
}

function Still({ v, label }: { v: string; label: string }) {
  const [broken, setBroken] = useState(false);
  if (broken) return <div className="flex aspect-video items-center justify-center bg-[var(--surface-2)] px-2 text-center text-[13px] text-[var(--text-faint)]">{label}</div>;
  return <img src={hwVisualPreview(v)} alt="" loading="lazy" onError={() => setBroken(true)} className="aspect-video w-full bg-[var(--surface-2)] object-cover [image-rendering:pixelated]" />;
}

export function VisualPicker({ target, busy, onPick, onClose }: {
  target: PickTarget | null;
  busy: boolean;
  onPick: (visual: string) => void;
  onClose: () => void;
}) {
  return (
    <Modal open={Boolean(target)} onClose={onClose} size="lg"
      title={target ? `Раунд ${target.round}${target.prizeName ? ` · ${target.prizeName}` : ""}: каким режимом крутить?` : ""}>
      <p className="mb-3 text-[13px] text-[var(--text-muted)]">
        Сцена сразу покажет приз раунда и выбранный режим, без отсчёта. Крутить начнёт кнопка «Начать» на карточке.
        {target?.superPrize && " Для суперприза обычно рыцари."}
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {HW_VISUALS.map(({ value, label }) => {
          const on = value === target?.current;
          return (
            <button key={value} type="button" disabled={busy} onClick={() => onPick(value)}
              className={cn(
                "group relative flex flex-col overflow-hidden rounded-[var(--r-md)] border text-left transition-[border-color,box-shadow] disabled:opacity-60",
                on ? "border-[var(--accent)] shadow-[var(--glow)]" : "border-[var(--line)] hover:border-[var(--accent)]"
              )}>
              <Still v={value} label={label} />
              <span className="flex items-center gap-1.5 px-2.5 py-2 text-[13.5px] font-semibold">
                {on && <Check className="h-4 w-4 shrink-0 text-[var(--accent-hi)]" />}
                <span className="min-w-0 truncate">{label}</span>
              </span>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}
