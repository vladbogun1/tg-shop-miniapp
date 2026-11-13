"use client";

/**
 * «Связанные ТТН» под посылкой заказа: что Новая почта создала на основании нашей ТТН — возврат к нам,
 * переадресацию, возврат после получения. Только показ: статус заказа они не меняют (решает админ —
 * «Посылка вернулась», «Доставлен», «Возврат»). Нет связанных — блока нет.
 */
import { ExternalLink } from "lucide-react";
import { CopyButton } from "@/components/ui/CopyButton";
import type { LinkedParcel } from "../model/types";
import { useParcelLinks } from "../queries";
import { ShipmentStageBadge } from "./parts";

const KIND: Record<string, string> = {
  RETURN: "Возврат к нам",
  REDIRECT: "Переадресация",
  LIGHT_RETURN: "Возврат после получения",
};

/** «18.11» из ISO-даты, без часового пояса (дата хранения у НП — календарная). */
function day(iso: string): string {
  const [, m, d] = iso.split("-");
  return d && m ? `${d}.${m}` : iso;
}

function Storage({ l }: { l: LinkedParcel }) {
  if (l.kind === "REDIRECT" || l.stage !== "ARRIVED" || !l.storagePaidFrom) return null;
  return <p className="text-[12.5px] leading-snug text-[var(--warn)]">Ждёт в отделении · платное хранение с {day(l.storagePaidFrom)}</p>;
}

function LinkRow({ l }: { l: LinkedParcel }) {
  return (
    <li className="flex min-w-0 flex-col gap-1 border-l-2 border-[var(--line)] pl-3">
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-[12px] font-semibold text-[var(--text-muted)]">{KIND[l.kind] ?? l.kind}</span>
        <span className="tabular text-[14px] font-bold text-[var(--ink)]">{l.ttn}</span>
        <CopyButton value={l.ttn} label="Скопировать ТТН" />
        <ShipmentStageBadge stage={l.stage} />
      </div>
      {l.statusText && <p className="break-words text-[12.5px] leading-snug text-[var(--text)]">{l.statusText}</p>}
      <Storage l={l} />
      <a
        href={l.trackingUrl}
        target="_blank"
        rel="noreferrer"
        className="hit inline-flex items-center gap-1 self-start text-[12px] font-semibold text-[var(--accent-hi)] hover:underline"
      >
        <ExternalLink className="h-3.5 w-3.5" />
        Отследить на сайте НП
      </a>
    </li>
  );
}

export function ParcelChain({ orderId, polledAt }: { orderId: string; polledAt: string }) {
  const { data } = useParcelLinks(orderId, polledAt);
  if (!data || data.length === 0) return null;
  return (
    <div className="flex min-w-0 flex-col gap-2" aria-label="Связанные ТТН">
      <h4 className="text-[12px] font-semibold text-[var(--text-muted)]">Связанные ТТН</h4>
      <ul className="flex min-w-0 flex-col gap-2.5">
        {data.map((l) => (
          <LinkRow key={l.ttn} l={l} />
        ))}
      </ul>
    </div>
  );
}
