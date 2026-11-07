"use client";

import { Modal } from "@shop/ui/overlay";

/** Показать длинный текст (ответ или промпт задачи) в окне, с прокруткой. */
export function ReviewTextDialog({ title, text, onClose }: { title: string; text: string; onClose: () => void }) {
  return (
    <Modal open onClose={onClose} title={title} size="md">
      <pre className="thin-scroll max-h-[60dvh] overflow-auto whitespace-pre-wrap break-words rounded-[var(--r-sm)] bg-[var(--surface-2)] p-3 text-[12px] text-[var(--text)]">{text}</pre>
    </Modal>
  );
}
