"use client";

/** Shimmer loading skeleton for a product card (design doc §8.4). */
export function ProductCardSkeleton() {
  return (
    <div className="glass flex flex-col overflow-hidden rounded-[var(--r-lg)] p-2">
      <div className="shimmer aspect-square w-full rounded-[var(--r-md)]" />
      <div className="flex flex-col gap-2 px-1 pb-1 pt-3">
        <div className="shimmer h-3 w-4/5 rounded-full" />
        <div className="shimmer h-3 w-2/5 rounded-full" />
        <div className="shimmer mt-1 h-4 w-1/3 rounded-full" />
      </div>
    </div>
  );
}
