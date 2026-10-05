"use client";

/**
 * QR code as a crisp inline SVG (qrcode-generator: ~20 KB, no dependencies). Dark modules on a white
 * tile with a quiet zone — inverted (light-on-dark) codes are not read by every authenticator app.
 */
import qrcode from "qrcode-generator";
import { useMemo } from "react";
import { cn } from "@/lib/cn";

export function QrCode({ value, size = 200, label, className }: { value: string; size?: number; label: string; className?: string }) {
  const { path, count } = useMemo(() => {
    const qr = qrcode(0, "M");
    qr.addData(value);
    qr.make();
    const n = qr.getModuleCount();
    let d = "";
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (qr.isDark(r, c)) d += `M${c + 4} ${r + 4}h1v1h-1z`;
      }
    }
    return { path: d, count: n + 8 };
  }, [value]);

  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${count} ${count}`}
      width={size}
      height={size}
      shapeRendering="crispEdges"
      className={cn("rounded-[var(--r-md)] bg-white", className)}
    >
      <rect width={count} height={count} fill="#fff" />
      <path d={path} fill="#0E0E10" />
    </svg>
  );
}
