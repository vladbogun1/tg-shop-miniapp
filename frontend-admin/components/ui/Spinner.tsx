import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("h-5 w-5 animate-spin text-[var(--accent)]", className)} />;
}

export function CenterSpinner({ label }: { label?: string }) {
  return (
    <div className="grid min-h-[40vh] place-items-center">
      <div className="flex flex-col items-center gap-3 text-[var(--text-muted)]">
        <Spinner className="h-7 w-7" />
        {label && <span className="text-[13px]">{label}</span>}
      </div>
    </div>
  );
}
