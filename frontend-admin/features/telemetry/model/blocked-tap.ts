/**
 * «Тап в невидимый слой»: палец попал не в кнопку, а в полноэкранный `position: fixed` слой, которого не видно
 * (прозрачный, `visibility: hidden`, под `aria-hidden`/`inert`) или в затемнение без открытого окна. Это ровно
 * жалоба «админка перестаёт реагировать на тапы, пока не перезайдёшь».
 *
 * Чистая функция над снимком: DOM читает `ui/dom-probe.ts`, здесь только правило — его можно проверить юнитом.
 */
export interface LayerInfo {
  /** computed `position` */
  position: string;
  /** собственная computed `opacity` элемента (0…1) */
  opacity: number;
  /** computed `visibility` (наследуется — у попавшего элемента уже итоговая) */
  visibility: string;
  /** доля вьюпорта, которую закрывает элемент (0…1); считается только для fixed */
  coverage: number;
  ariaHidden: boolean;
  inert: boolean;
  /** похоже на затемнение: имя backdrop/overlay/scrim или полупрозрачный фон */
  backdropLike: boolean;
}

export interface TapSnapshot {
  /** от попавшего под палец элемента вверх до `body` (не включая) */
  chain: LayerInfo[];
  /** сколько окон (`[role=dialog]`, `[aria-modal=true]`) сейчас реально видно */
  visibleDialogs: number;
}

export type BlockReason = "transparent" | "hidden" | "aria_hidden" | "inert" | "empty_backdrop";

export interface BlockedTap {
  reason: BlockReason;
  /** индекс полноэкранного fixed-слоя в `chain` */
  layerIndex: number;
}

export const MIN_COVERAGE = 0.8;
export const MIN_OPACITY = 0.05;

/** Почему тап «съеден», или `null`, если палец попал во что-то нормальное. */
export function classifyTap(snap: TapSnapshot): BlockedTap | null {
  const { chain } = snap;
  const layerIndex = chain.findIndex((l) => l.position === "fixed" && l.coverage >= MIN_COVERAGE);
  if (layerIndex < 0) return null;
  const hit = chain[0];
  if (!hit) return null;
  // Итоговая непрозрачность — произведение по всем предкам (opacity не наследуется, а перемножается).
  const opacity = chain.reduce((acc, l) => acc * l.opacity, 1);
  if (opacity < MIN_OPACITY) return { reason: "transparent", layerIndex };
  if (hit.visibility === "hidden" || chain[layerIndex]?.visibility === "hidden") return { reason: "hidden", layerIndex };
  if (chain.some((l) => l.ariaHidden)) return { reason: "aria_hidden", layerIndex };
  if (chain.some((l) => l.inert)) return { reason: "inert", layerIndex };
  if (hit.backdropLike && snap.visibleDialogs === 0) return { reason: "empty_backdrop", layerIndex };
  return null;
}
