"use client";

/**
 * «Эта накладная уже разбиралась»: тот же файл (по содержимому) уже в черновике или принятой поставке за последние
 * 7 дней. Не запрещает — бывает, что разобрать ещё раз и нужно, — но показывает, куда уже потрачены деньги на ИИ.
 */
import { TriangleAlert } from "lucide-react";
import Link from "next/link";
import { sameInvoiceHref, sameInvoiceLabel } from "../../model/drafts/same-invoice";
import { useSameInvoice } from "../../queries-drafts";

export function SameInvoiceNotice({ fileIds, onOpen }: { fileIds: number[]; onOpen: () => void }) {
  const same = useSameInvoice(fileIds).data ?? [];
  if (!same.length) return null;
  return (
    <div role="status" className="flex min-w-0 gap-2.5 rounded-[var(--r-md)] border border-[color-mix(in_srgb,var(--warn)_35%,transparent)] bg-[color-mix(in_srgb,var(--warn)_10%,transparent)] p-3 text-[13px]">
      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-[var(--warn)]" aria-hidden />
      <div className="min-w-0">
        <p className="font-semibold">Эта накладная уже разбиралась</p>
        <ul className="mt-1 flex flex-col gap-0.5">
          {same.map((d) => (
            <li key={d.id} className="min-w-0 break-words">
              <Link href={sameInvoiceHref(d)} onClick={onOpen} className="text-[var(--accent-hi)] underline-offset-4 hover:underline">
                {sameInvoiceLabel(d)}
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-1 text-[var(--text-muted)]">Откройте его, чтобы не платить за ИИ второй раз, или разберите заново.</p>
      </div>
    </div>
  );
}
