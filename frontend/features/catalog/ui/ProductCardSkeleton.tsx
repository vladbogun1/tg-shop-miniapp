"use client";

/** ChiSetup product card skeleton — graphite tile mirroring the real card. */
export function ProductCardSkeleton() {
  return (
    <div className="nb flex h-full w-full flex-col overflow-hidden">
      <div className="shimmer aspect-square w-full rounded-none" />
      <div className="flex flex-col gap-2 p-2.5">
        <div className="shimmer h-3.5 w-full" />
        <div className="shimmer h-3.5 w-2/3" />
        <div className="shimmer mt-1 h-5 w-20" />
        <div className="shimmer mt-1 h-10 w-full" />
      </div>
    </div>
  );
}
