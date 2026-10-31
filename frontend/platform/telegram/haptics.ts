import { webApp } from "./webapp";

/** Best-effort light haptic tap. */
export function haptic(): void {
  try {
    webApp()?.HapticFeedback?.impactOccurred?.("light");
  } catch {
    /* noop */
  }
}

/** Best-effort selection tick (the gift case reel crossing a tile). */
export function hapticSelection(): void {
  try {
    webApp()?.HapticFeedback?.selectionChanged?.();
  } catch {
    /* noop */
  }
}

/** Best-effort impact of a given strength ("light" | "medium" | "heavy" | "rigid" | "soft"). */
export function hapticImpact(style: "light" | "medium" | "heavy" | "rigid" | "soft"): void {
  try {
    webApp()?.HapticFeedback?.impactOccurred?.(style);
  } catch {
    /* noop */
  }
}

/** Best-effort "success" haptic (payment went through). */
export function hapticSuccess(): void {
  try {
    webApp()?.HapticFeedback?.notificationOccurred?.("success");
  } catch {
    /* noop */
  }
}
