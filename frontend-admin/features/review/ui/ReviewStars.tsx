import { Star } from "lucide-react";
import { cn } from "@/lib/cn";

/** Оценка 1–5 звёздами (aria: «Оценка N из 5»). */
export function Stars({ rating, className, size = "md" }: { rating: number; className?: string; size?: "sm" | "md" }) {
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)} aria-label={`Оценка ${rating} из 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          aria-hidden
          className={cn(
            size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4",
            i <= rating ? "fill-[var(--accent)] text-[var(--accent)]" : "text-[var(--text-faint)] opacity-50"
          )}
          strokeWidth={1.75}
        />
      ))}
    </span>
  );
}
