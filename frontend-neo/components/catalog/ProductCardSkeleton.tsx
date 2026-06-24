"use client";

/** NEO-BRUTALISM product card skeleton — bordered tile mirroring the real card. */
export function ProductCardSkeleton() {
  return (
    <div className="nb flex h-full w-full flex-col overflow-hidden">
      <div className="aspect-square w-full border-b-[3px] border-[var(--line)] shimmer" style={{ border: "none" }} />
      <div className="flex flex-col gap-2 p-2.5">
        <div className="shimmer h-3.5 w-full" style={{ border: "none" }} />
        <div className="shimmer h-3.5 w-2/3" style={{ border: "none" }} />
        <div className="shimmer mt-1 h-6 w-20" style={{ border: "none" }} />
        <div className="shimmer mt-1 h-9 w-full" style={{ border: "none" }} />
      </div>
    </div>
  );
}
