"use client";

/**
 * A prize photo on the remote: a shop photo key / https link through <Image>, or `sets/<name>` — a whole pack
 * drawn as one picture, served by the draw service itself (events/halloween/draw/assets/prizes).
 */
import { Image } from "@/lib/image";

export const isPackPicture = (key: string) => key.startsWith("sets/");

export function PrizePhoto({ imageKey, size, className }: { imageKey: string; size: number; className?: string }) {
  if (isPackPicture(imageKey)) {
    return <img src={`/hw/draw/assets/prizes/${imageKey.slice(5)}.webp`} alt="" loading="lazy" className={className} />;
  }
  return <Image imageKey={imageKey} alt="" size={size} className={className} />;
}
