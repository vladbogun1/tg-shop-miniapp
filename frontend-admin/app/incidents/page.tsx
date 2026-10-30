"use client";

/**
 * «Инциденты» (route "/incidents") — only for the main admin (SUPER_ADMIN). Money/order cases to
 * look into: found by the detector from the data (refused orders that kept money without «удержано»,
 * the money journal not matching the order, a parcel «едет назад» for weeks, orders deleted for good
 * before the archive) plus hand-made cards with a hypothesis. Open ones first; «Решено» needs a
 * comment. The backend answers 403 for everyone else (/api/admin/incidents/**).
 */
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, RotateCcw, ShieldAlert, Siren } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { useIsSuperAdmin } from "@/components/layout/Shell";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@shop/ui/admin-button";
import { EmptyState } from "@/components/ui/EmptyState";
import { QueryState } from "@/components/ui/QueryState";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Textarea } from "@/components/ui/Textarea";
import { apiGet, apiPost, ApiError } from "@/lib/api";
import { toast } from "@shop/ui/toast";
import { formatDateTime } from "@shop/core/time";

interface Incident {
  id: number;
  code: string;
  auto: boolean;
  title: string;
  orderRef: string | null;
  severity: "HIGH" | "MEDIUM" | "LOW";
  status: "OPEN" | "RESOLVED";
  facts: string | null;
  hypothesis: string | null;
  suggestion: string | null;
  resolution: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

const SEVERITY: Record<Incident["severity"], { label: string; tone: "danger" | "warn" | "neutral" }> = {
  HIGH: { label: "Важно", tone: "danger" },
  MEDIUM: { label: "Средне", tone: "warn" },
  LOW: { label: "Мелочь", tone: "neutral" },
};

const RANK: Record<Incident["severity"], number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

/** A deleted order the detector found and nobody has written up yet (it still has the detector's title). */
function isRoutine(i: Incident): boolean {
  return i.title.startsWith("Заказ удалён безвозвратно");
}

function dt(iso: string | null): string {
  return iso
    ? formatDateTime(iso)
    : "—";
}

export default function IncidentsPage() {
  const superAdmin = useIsSuperAdmin();
  const [tab, setTab] = useState<"OPEN" | "RESOLVED">("OPEN");
  const q = useQuery({
    queryKey: ["incidents"],
    queryFn: () => apiGet<Incident[]>("/api/admin/incidents"),
    enabled: superAdmin !== false,
  });
  if (superAdmin === false) {
    return <EmptyState icon={ShieldAlert} title="Только для главного админа" />;
  }
  // Important first; within a level, cards with a written-up hypothesis before the detector's routine ones.
  const rows = (q.data ?? [])
    .filter((i) => i.status === tab)
    .sort((a, b) => RANK[a.severity] - RANK[b.severity] || Number(isRoutine(a)) - Number(isRoutine(b)));
  const open = (q.data ?? []).filter((i) => i.status === "OPEN").length;
  return (
    <div className="mx-auto w-full max-w-4xl">
      <PageHeader
        title="Инциденты"
        subtitle="Случаи с деньгами и заказами, которые стоит разобрать. Видите только вы."
        actions={
          <SegmentedControl
            value={tab}
            onChange={setTab}
            options={[
              { value: "OPEN", label: `Открытые${open ? ` · ${open}` : ""}` },
              { value: "RESOLVED", label: "Решённые" },
            ]}
          />
        }
      />
      <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error} refetch={q.refetch} loadingLabel="Проверяем данные…">
        {rows.length === 0 ? (
          <EmptyState icon={CheckCircle2} title={tab === "OPEN" ? "Открытых инцидентов нет" : "Решённых пока нет"} />
        ) : (
          <div className="flex flex-col gap-3">
            {rows.map((i) => (
              <IncidentCard key={i.id} i={i} />
            ))}
          </div>
        )}
      </QueryState>
    </div>
  );
}

function IncidentCard({ i }: { i: Incident }) {
  const qc = useQueryClient();
  const [closing, setClosing] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const sev = SEVERITY[i.severity] ?? SEVERITY.MEDIUM;

  async function act(path: string, body?: unknown) {
    setBusy(true);
    try {
      await apiPost(`/api/admin/incidents/${i.id}/${path}`, body ?? {});
      await qc.invalidateQueries({ queryKey: ["incidents"] });
      setClosing(false);
      setText("");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Не получилось");
    } finally {
      setBusy(false);
    }
  }

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
        {i.status === "RESOLVED" && (
          <Field label={`Решено · ${i.resolvedBy ?? "—"} · ${dt(i.resolvedAt)}`}>{i.resolution ?? "—"}</Field>
        )}
      </dl>
      <footer className="mt-3 flex flex-wrap items-end gap-2">
        {i.status === "OPEN" ? (
          closing ? (
            <div className="flex w-full flex-col gap-2">
              <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder="Чем закончилось: вернули, удержали за доставку, ошибка учёта…" autoFocus />
              <div className="flex gap-2">
                <Button variant="accent" size="sm" loading={busy} disabled={text.trim().length < 3} onClick={() => act("resolve", { resolution: text })}>
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
          <Button variant="ghost" size="sm" loading={busy} icon={<RotateCcw className="h-4 w-4" />} onClick={() => act("reopen")}>
            Открыть снова
          </Button>
        )}
      </footer>
    </article>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-[var(--text-muted)]">{label}</dt>
      <dd className="whitespace-pre-line text-[var(--text)]">{children}</dd>
    </div>
  );
}
