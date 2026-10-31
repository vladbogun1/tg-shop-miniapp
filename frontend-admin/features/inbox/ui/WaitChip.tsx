import { Clock } from "lucide-react";
import type { CSSProperties } from "react";
import { cn } from "@/lib/cn";
import { formatWait } from "../model/inbox";

export function WaitChip({ minutes, overdue }: { minutes: number; overdue: boolean }) {
  return (
    <span
      title="Сколько ждёт"
      style={{ "--chip": overdue ? "#F87171" : "var(--text-muted)" } as CSSProperties}
      className={cn("chip-tint !h-[22px] !gap-1 !px-2 !text-[10.5px]", !overdue && "!bg-[var(--surface-3)]")}
    >
      <Clock className="h-3 w-3" />
      {formatWait(minutes)}
    </span>
  );
}
