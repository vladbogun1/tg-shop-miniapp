"use client";

import { Button } from "@shop/ui/admin-button";
import { formatDateTime } from "@shop/core/time";
import { CheckCircle2, RotateCcw, Siren } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/Badge";
import { Textarea } from "@/components/ui/Textarea";
import type { Incident } from "../api";
import { SEVERITY, severityOf } from "../model/incidents";
import { useIncidentAction } from "../queries";

function dt(iso: string | null | undefined): string {
  return iso ? formatDateTime(iso) : "—";
}

export function IncidentCard({ i }: { i: Incident }) {
  const [closing, setClosing] = useState(false);
  const [text, setText] = useState("");
  const act = useIncidentAction(() => {
    setClosing(false);
    setText("");
  });
  const busy = act.isPending;
  const sev = SEVERITY[severityOf(i)];

  return (
    <article className="rounded-[var(--r-md)] border border-[var(--border-2)] bg-[var(--surface)] p-4">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <Siren className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-muted)]" />
          <h3 className="min-w-0 text-[14px] font-semibold leading-snug text-[var(--text)]">{i.title}</h3>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Badge tone={sev.tone}>{sev.label}</Badge>
          <Badge tone="neutral">{i.auto ? "Найдено автоматически" : "Разбор"}</Badge>
        </div>
      </header>
      <div className="mt-1 text-[11.5px] text-[var(--text-muted)]">
        {i.orderRef ? (
          <>
            Заказ{" "}
            <Link href={`/orders/${i.orderRef}`} className="font-mono text-[var(--accent)] hover:underline">
              #{i.orderRef.slice(0, 8)}
            </Link>
            {" · "}
          </>
        ) : null}
        добавлен {dt(i.createdAt)}
      </div>
      <dl className="mt-3 flex flex-col gap-2 text-[13px] leading-relaxed">
        {i.facts && <Field label="Факты">{i.facts}</Field>}
        {i.hypothesis && <Field label="Что, вероятно, произошло">{i.hypothesis}</Field>}
        {i.suggestion && <Field label="Что сделать">{i.suggestion}</Field>}
        {i.status === "RESOLVED" && <Field label={`Решено · ${i.resolvedBy ?? "—"} · ${dt(i.resolvedAt)}`}>{i.resolution ?? "—"}</Field>}
      </dl>
      <footer className="mt-3 flex flex-wrap items-end gap-2">
        {i.status === "OPEN" ? (
          closing ? (
            <div className="flex w-full flex-col gap-2">
              <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder="Чем закончилось: вернули, удержали за доставку, ошибка учёта…" autoFocus />
              <div className="flex gap-2">
                <Button variant="accent" size="sm" loading={busy} disabled={text.trim().length < 3} onClick={() => act.mutate({ id: i.id, resolution: text })}>
                  Решено
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setClosing(false)}>
                  Отмена
                </Button>
              </div>
            </div>
          ) : (
            <Button size="sm" icon={<CheckCircle2 className="h-4 w-4" />} onClick={() => setClosing(true)}>
              Отметить решённым
            </Button>
          )
        ) : (
          <Button variant="ghost" size="sm" loading={busy} icon={<RotateCcw className="h-4 w-4" />} onClick={() => act.mutate({ id: i.id })}>
            Открыть снова
          </Button>
        )}
      </footer>
    </article>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-[var(--text-muted)]">{label}</dt>
      <dd className="whitespace-pre-line text-[var(--text)]">{children}</dd>
    </div>
  );
}
