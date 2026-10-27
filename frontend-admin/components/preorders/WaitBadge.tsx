"use client";

/** Бейдж «ждут N» у товара в списке (из «Чего ждут»); клик — кто ждёт. Один общий запрос на все строки. */
import { useState } from "react";
import { BellRing } from "lucide-react";
import { demandOfProduct, useDemand } from "@/lib/preorders";
import { WaitersModal } from "./WaitersModal";

export function WaitBadge({ productId, title }: { productId: string; title: string }) {
  const q = useDemand();
  const [open, setOpen] = useState(false);
  const d = demandOfProduct(q.data, productId);
  if (!d) return null;
  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        title={`Ждут: ${d.people} чел / ${d.units} шт`}
        className="chip-tint focusable cursor-pointer"
        style={{ "--chip": "var(--accent-hi)" } as React.CSSProperties}
      >
        <BellRing className="h-3 w-3" />
        ждут {d.people}
      </button>
      {open && <WaitersModal open={open} onClose={() => setOpen(false)} productId={productId} title={title} />}
    </>
  );
}

/** Строка в карточке товара: «Ждут: 7 чел / 9 шт» со ссылкой на список. */
export function WaitLine({ productId, title }: { productId: string; title: string }) {
  const q = useDemand();
  const [open, setOpen] = useState(false);
  const d = demandOfProduct(q.data, productId);
  if (!d) return null;
  return (
    <>
      <div className="card-2 flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-[13px]">
        <span className="text-[var(--text)]">
          Ждут: <b>{d.people} чел / {d.units} шт</b>
        </span>
        <button type="button" onClick={() => setOpen(true)} className="font-semibold text-[var(--accent-hi)] hover:underline">
          Показать список
        </button>
      </div>
      {open && <WaitersModal open={open} onClose={() => setOpen(false)} productId={productId} title={title} />}
    </>
  );
}
