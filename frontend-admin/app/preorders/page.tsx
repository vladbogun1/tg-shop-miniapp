"use client";

/**
 * «Поставки» (route "/preorders"): заказы у заводов и очереди ждущих покупателей.
 * Вкладки: Открытые · Приехали · Отменённые · Чего ждут · Поставщики.
 * `?newProduct=<id>` открывает форму новой поставки с этим товаром (из карточки товара и «Ждут»).
 */
import { Suspense, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Factory, Plus, Truck, Users } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { adminApi } from "@/lib/api";
import { formatDateTime } from "@/lib/orders";
import { money } from "@/lib/money";
import { Image } from "@/lib/image";
import {
  BATCH_STATUS_LABEL,
  BATCH_STATUS_TONE,
  PREORDERS_KEY,
  etaText,
  lineTitle,
  preordersApi,
  useDemand,
  type BatchFilter,
  type BatchSummary,
  type Demand,
} from "@/lib/preorders";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { QueryState } from "@/components/ui/QueryState";
import { Tabs } from "@/components/ui/Tabs";
import { BatchFormModal, type SeedLine } from "@/components/preorders/BatchFormModal";
import { SupplierModal } from "@/components/preorders/SupplierModal";

type TabKey = "open" | "arrived" | "cancelled" | "demand" | "suppliers";

export default function PreordersPage() {
  return (
    <Suspense fallback={null}>
      <PreordersScreen />
    </Suspense>
  );
}

function PreordersScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const [tab, setTab] = useState<TabKey>("open");
  const [form, setForm] = useState<{ seed: SeedLine[] } | null>(null);
  const [supplierModal, setSupplierModal] = useState(false);

  const demandQ = useDemand();
  const productsQ = useQuery({ queryKey: ["products"], queryFn: () => adminApi.products(), staleTime: 60_000 });

  // Глубокая ссылка «?newProduct=id»: открыть форму с этим товаром, один раз.
  const newProduct = params.get("newProduct");
  useEffect(() => {
    if (!newProduct || !productsQ.data) return;
    const p = productsQ.data.find((x) => x.id === newProduct);
    router.replace("/preorders");
    if (!p) return;
    const img = p.images?.[0]?.url ?? null;
    const seed: SeedLine[] =
      p.variants && p.variants.length > 0
        ? p.variants.map((v) => ({ productId: p.id, variantId: v.id ?? null, title: p.title, variantName: v.name, imageUrl: img }))
        : [{ productId: p.id, variantId: null, title: p.title, variantName: null, imageUrl: img }];
    setForm({ seed });
  }, [newProduct, productsQ.data, router]);

  const demandCount = demandQ.data?.length;
  const tabs = [
    { value: "open" as TabKey, label: "Открытые" },
    { value: "arrived" as TabKey, label: "Приехали" },
    { value: "cancelled" as TabKey, label: "Отменённые" },
    { value: "demand" as TabKey, label: "Чего ждут", count: demandCount },
    { value: "suppliers" as TabKey, label: "Поставщики" },
  ];

  return (
    <div className="min-w-0">
      <PageHeader
        title="Поставки"
        subtitle="Что заказано у заводов, кто ждёт и что делать, когда товар приехал."
        actions={
          tab === "suppliers" ? (
            <Button variant="accent" icon={<Plus className="h-4 w-4" />} onClick={() => setSupplierModal(true)}>
              Поставщик
            </Button>
          ) : (
            <Button variant="accent" icon={<Plus className="h-4 w-4" />} onClick={() => setForm({ seed: [] })}>
              Новая поставка
            </Button>
          )
        }
      />
      <Tabs items={tabs} value={tab} onChange={setTab} className="mb-4" />

      {(tab === "open" || tab === "arrived" || tab === "cancelled") && <BatchList filter={tab} onCreate={() => setForm({ seed: [] })} />}
      {tab === "demand" && <DemandList q={demandQ} onOrder={(d) => setForm({ seed: [seedOf(d)] })} />}
      {tab === "suppliers" && <Suppliers />}

      <BatchFormModal
        open={!!form}
        onClose={() => setForm(null)}
        seed={form?.seed}
        onSaved={(b) => router.push(`/preorders/${b.id}`)}
      />
      <SupplierModal open={supplierModal} onClose={() => setSupplierModal(false)} />
    </div>
  );
}

function seedOf(d: Demand): SeedLine {
  return { productId: d.productId, variantId: d.variantId, title: d.title, variantName: d.variantName, imageUrl: d.imageUrl, qty: Math.max(1, d.units) };
}

function BatchList({ filter, onCreate }: { filter: BatchFilter; onCreate: () => void }) {
  const q = useQuery({ queryKey: [...PREORDERS_KEY, "batches", filter], queryFn: () => preordersApi.batches(filter) });
  const empty = {
    open: "Открытых поставок нет",
    arrived: "Приехавших поставок пока нет",
    cancelled: "Отменённых поставок нет",
  } as Record<string, string>;
  return (
    <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error} refetch={q.refetch} loadingLabel="Загрузка поставок">
      {q.data && q.data.length === 0 ? (
        <EmptyState
          icon={Truck}
          title={empty[filter]}
          description={filter === "open" ? "Создайте поставку, когда закажете партию у завода: покупатели увидят срок и смогут встать в очередь." : undefined}
          action={
            filter === "open" ? (
              <Button variant="accent" icon={<Plus className="h-4 w-4" />} onClick={onCreate}>
                Новая поставка
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="flex min-w-0 flex-col gap-2">
          {q.data?.map((b) => (
            <BatchRow key={b.id} b={b} />
          ))}
        </div>
      )}
    </QueryState>
  );
}

function BatchRow({ b }: { b: BatchSummary }) {
  return (
    <Link href={`/preorders/${b.id}`} className="card card-hover flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 p-3.5">
      <div className="min-w-0 flex-1 basis-60">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="min-w-0 break-words text-[15px] font-semibold text-[var(--text)]">{b.title}</h3>
          <Badge tone={BATCH_STATUS_TONE[b.status]} dot>
            {BATCH_STATUS_LABEL[b.status]}
          </Badge>
          {!b.preorderOpen && b.status !== "ARRIVED" && b.status !== "CANCELLED" && <Badge>закупка без предзаказа</Badge>}
        </div>
        <div className="mt-1 text-[12.5px] text-[var(--text-muted)]">
          {b.supplierName ?? "без поставщика"}
          {b.arrivedAt ? ` · приехала ${formatDateTime(b.arrivedAt)}` : ` · срок: ${etaText(b)}`}
        </div>
      </div>
      <Stat label="Позиций" value={`${b.itemsCount}`} />
      <Stat label="Заказано" value={`${b.qtyOrdered} шт`} />
      <Stat label="Ждут" value={`${b.waitingPeople} чел / ${b.waitingQty} шт`} accent={b.waitingPeople > 0} />
    </Link>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="min-w-[5.5rem]">
      <div className="text-[11px] text-[var(--text-faint)]">{label}</div>
      <div className={"tabular font-display text-[14px] font-bold " + (accent ? "text-[var(--accent-hi)]" : "text-[var(--ink)]")}>{value}</div>
    </div>
  );
}

function DemandList({ q, onOrder }: { q: ReturnType<typeof useDemand>; onOrder: (d: Demand) => void }) {
  const rows = useMemo(() => [...(q.data ?? [])].sort((a, b) => b.people - a.people || b.units - a.units), [q.data]);
  return (
    <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error} refetch={q.refetch} loadingLabel="Считаем спрос">
      {rows.length === 0 ? (
        <EmptyState icon={Users} title="Пока никто не ждёт" description="Здесь появятся товары, на которые покупатели встали в очередь." />
      ) : (
        <div className="flex min-w-0 flex-col gap-2">
          {rows.map((d) => (
            <div key={`${d.productId}:${d.variantId ?? ""}`} className="card flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 p-3">
              <Image src={d.imageUrl} alt={d.title} size={120} className="h-14 w-14 shrink-0 rounded-[var(--r-md)] border border-[var(--line)]" />
              <div className="min-w-0 flex-1 basis-56">
                <div className="line-clamp-2 break-words text-[14px] font-semibold leading-snug text-[var(--text)]">{lineTitle(d.title, d.variantName)}</div>
                <div className="tabular mt-0.5 text-[12px] text-[var(--text-faint)]">
                  {money(d.priceMinor)} · на складе {d.stock} · первый встал {formatDateTime(d.firstAt)}
                </div>
              </div>
              <Stat label="Ждут" value={`${d.people} чел / ${d.units} шт`} accent />
              <Stat label="Новых за 7 дней" value={`+${d.newLast7d}`} />
              <div className="min-w-[11rem]">
                {d.openBatchId != null ? (
                  <Link href={`/preorders/${d.openBatchId}`} className="text-[13px] font-semibold text-[var(--accent-hi)] hover:underline">
                    уже едет: {d.openBatchTitle}
                  </Link>
                ) : (
                  <Button size="sm" variant="outline" icon={<Factory className="h-4 w-4" />} onClick={() => onOrder(d)}>
                    Заказать у завода
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </QueryState>
  );
}

function Suppliers() {
  const q = useQuery({ queryKey: [...PREORDERS_KEY, "suppliers"], queryFn: preordersApi.suppliers });
  return (
    <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error} refetch={q.refetch}>
      {q.data && q.data.length === 0 ? (
        <EmptyState icon={Factory} title="Поставщиков нет" description="Добавьте завод или продавца, у которого заказываете." />
      ) : (
        <div className="grid min-w-0 gap-2 sm:grid-cols-2">
          {q.data?.map((s) => (
            <div key={s.id} className="card p-3.5">
              <div className="text-[14px] font-semibold text-[var(--text)]">{s.name}</div>
              {s.note && <div className="mt-0.5 break-words text-[12.5px] text-[var(--text-muted)]">{s.note}</div>}
            </div>
          ))}
        </div>
      )}
    </QueryState>
  );
}
