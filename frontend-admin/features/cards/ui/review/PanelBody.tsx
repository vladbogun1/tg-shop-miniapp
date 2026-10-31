"use client";

import type { CardItem } from "../../model/item";
import type { CardSchema } from "../../model/schema";
import { PanelFooter } from "./PanelFooter";
import { PanelHeader } from "./PanelHeader";
import { ReviewBody } from "./ReviewBody";
import { useReviewPanel } from "./use-review-panel";

interface Props {
  layer: string;
  item: CardItem;
  schema: CardSchema | undefined;
  position: { index: number; total: number };
  onPrev: (() => void) | null;
  onNext: (() => void) | null;
  onClose: () => void;
  onDone: () => void;
  onReAi: () => void;
  onDirty: (d: boolean) => void;
}

/** Содержимое панели проверки: шапка, прокручиваемое тело, низ с кнопками. */
export function PanelBody({ layer, item, schema, position, onPrev, onNext, onClose, onDone, onReAi, onDirty }: Props) {
  const s = useReviewPanel({ layer, item, onPrev, onNext, onDone, onDirty });
  return (
    <>
      <PanelHeader cur={s.cur} onClose={onClose} />
      <div className="thin-scroll min-h-0 flex-1 overflow-auto overscroll-contain px-4 py-4 sm:px-5">
        <ReviewBody s={s} schema={schema} />
      </div>
      <PanelFooter
        tab={s.tab}
        dirty={s.dirty}
        busy={s.busy}
        position={position}
        editorHref={`/products?edit=${s.cur.id}&step=specs`}
        onPrev={onPrev}
        onNext={onNext}
        onReAi={onReAi}
        onAccept={s.accept}
        onSaveEdits={s.saveEdits}
        onSendBack={s.sendBack}
      />
    </>
  );
}
