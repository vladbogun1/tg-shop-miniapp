"use client";

import { useShopSetting } from "@/lib/settings";
import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Archive, EyeOff, PackageSearch, PackageX, Pencil, ShoppingCart, Snowflake, Trophy, Warehouse } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { QueryState } from "@/components/ui/QueryState";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { ApiError } from "@/lib/api";
import { staggerContainer } from "@/lib/motion";
import { useToast } from "@/lib/toast";
import { metricsApi, type PeriodParams, type ReorderRow, type Stock } from "../api";
import { num, uah, uahShort } from "../format";
import { Empty, InlineBar, KpiTile, Note, Panel, StatusChip, TableWrap, useLimited } from "../ui";

const COVER_OPTIONS = [14, 30, 60, 90] as const;

export function editHref(productId: string) {
  return `/products?edit=${productId}`;
}

export function UrgencyChip({ row }: { row: Pick<ReorderRow, "daysToZero" | "urgency" | "stock"> }) {
  if (row.stock <= 0) return <StatusChip tone="danger">● закончился</StatusChip>;
  const days = row.daysToZero == null ? "—" : `${Math.round(row.daysToZero)} дн`;
  if (row.urgency === "critical") return <StatusChip tone="danger">● {days}</StatusChip>;
  if (row.urgency === "soon") return <StatusChip tone="warn">◐ {days}</StatusChip>;
  return <StatusChip tone="muted">○ {days}</StatusChip>;
}

export function StockTab({ params }: { params: PeriodParams }) {
  // Default threshold comes from «Настройки» (metrics.deadStockDays); a click on 30/60/90 overrides it.
  const defaultDead = useShopSetting("metrics.deadStockDays", 60);
  const [pickedDead, setDeadDays] = useState<number | null>(null);
  const deadDays = pickedDead ?? defaultDead;
  const [coverDays, setCoverDays] = useState<number>(30);
  const q = useQuery({
    queryKey: ["metrics2", "stock", params, deadDays, coverDays],
    queryFn: () => metricsApi.stock(params, deadDays, coverDays),
    placeholderData: keepPreviousData,
  });
  return (
    <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error} refetch={q.refetch} loadingLabel="Считаем склад…">
      {q.data && (
        <StockBody s={q.data} deadDays={deadDays} setDeadDays={setDeadDays} coverDays={coverDays} setCoverDays={setCoverDays} />
      )}
    </QueryState>
  );
}

function StockBody({
  s,
  deadDays,
  setDeadDays,
  coverDays,
  setCoverDays,
}: {
  s: Stock;
  deadDays: number;
  setDeadDays: (n: number) => void;
  coverDays: number;
  setCoverDays: (n: number) => void;
}) {
  const k = s.kpis;
  const [topBy, setTopBy] = useState<"revenue" | "units">("revenue");
  const top = [...s.topProducts]
    .sort((a, b) => (topBy === "revenue" ? b.revenueMinor - a.revenueMinor : b.units - a.units))
    .slice(0, 15);
  const topMax = Math.max(1, ...top.map((t) => (topBy === "revenue" ? t.revenueMinor : t.units)));
  const reorderRows = useLimited(s.reorder.rows, 12);
  const demandRows = useLimited(s.reorder.missedDemand, 8);
  const forgottenRows = useLimited(s.forgotten, 8);
  // The backend counts "running out" with the setting metrics.lowStockDays — show the same number.
  const lowStockDays = useShopSetting("metrics.lowStockDays", 14);

  return (
    <motion.div variants={staggerContainer} initial="initial" animate="animate" className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <KpiTile label="Склад по рознице" value={uahShort(k.stockValueMinor)} hint={`${num(k.stockUnits)} шт. · ${num(k.liveProducts)} товаров на витрине`} />
        <KpiTile
          label="Дней запаса"
          value={k.daysOfCover == null ? "—" : `${Math.round(k.daysOfCover)} дн`}
          hint="Склад / продажи в день за последние 30 дней (в рознице)"
        />
        <KpiTile label={`Не продаётся ${deadDays}+ дн`} value={uahShort(k.deadStockMinor)} hint={`${num(k.deadStockProducts)} товаров — деньги лежат на полке`} />
        <KpiTile label={`Заканчиваются ≤ ${lowStockDays} дн`} value={num(k.runningOutProducts)} hint="Товары и варианты по скорости продаж" />
        <KpiTile label="Забытый сток" value={uahShort(k.forgottenMinor)} hint={`${num(k.forgottenProducts)} скрытых/архивных с остатком`} />
      </div>

      <Panel
        title="Что дозаказать"
        icon={ShoppingCart}
        hint="Хорошо продаётся и скоро закончится. Рекомендуемое количество — чтобы хватило на выбранный срок."
        actions={
          <SegmentedControl
            size="sm"
            options={COVER_OPTIONS.map((d) => ({ value: String(d), label: `на ${d} дн` }))}
            value={String(coverDays)}
            onChange={(v) => setCoverDays(Number(v))}
          />
        }
      >
        {s.reorder.rows.length === 0 ? (
          <Empty>Ничего не заканчивается в ближайшие {coverDays} дней</Empty>
        ) : (
          <>
          <TableWrap>
            <table className="mx-table">
              <thead>
                <tr>
                  <th>Товар</th>
                  <th className="r">Остаток</th>
                  <th className="r">Продано 30 / 90 дн</th>
                  <th className="r">В месяц</th>
                  <th>Закончится через</th>
                  <th className="r">Заказать</th>
                  <th className="r" title="Просмотры и добавления в корзину за 30 дней">Интерес 30 дн</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {reorderRows.visible.map((r) => (
                  <tr key={r.productId + (r.variantId ?? "")}>
                    <td>
                      <div className="font-semibold">{r.title}</div>
                      {r.variantName && <div className="text-[11px] text-[var(--text-muted)]">вариант: {r.variantName}</div>}
                    </td>
                    <td className="r">{num(r.stock)}</td>
                    <td className="r">
                      {num(r.sold30)} / {num(r.sold90)}
                    </td>
                    <td className="r">≈ {(Math.round(r.velocityPerDay * 30 * 10) / 10).toLocaleString("ru-RU")}</td>
                    <td>
                      <UrgencyChip row={r} />
                    </td>
                    <td className="r font-semibold">{r.recommendQty > 0 ? `${num(r.recommendQty)} шт.` : "—"}</td>
                    <td className="r text-[var(--text-muted)]">
                      {num(r.views30)} просм. · {num(r.cartAdds30)} в корз.
                    </td>
                    <td className="r">
                      <Link href={editHref(r.productId)} className="inline-flex items-center gap-1 text-[12px] font-semibold text-[var(--accent-hi)] hover:underline">
                        <Pencil className="h-3.5 w-3.5" /> Остаток
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
          {reorderRows.toggle}
          </>
        )}
        <div className="mt-3">
          <Note>{s.reorder.method}</Note>
        </div>
      </Panel>

      <Panel
        title="Спрос есть, товара нет"
        icon={PackageSearch}
        hint="Закончились или скрыты, но их смотрят и кладут в корзину (30 дней) или недавно покупали (90 дней) — кандидаты вернуть в продажу."
      >
        {s.reorder.missedDemand.length === 0 ? (
          <Empty>Таких товаров нет</Empty>
        ) : (
          <>
          <TableWrap>
            <table className="mx-table">
              <thead>
                <tr>
                  <th>Товар</th>
                  <th>Статус</th>
                  <th className="r">Смотрели</th>
                  <th className="r">В корзину</th>
                  <th className="r">Продано 90 дн</th>
                  <th className="r">Последняя продажа</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {demandRows.visible.map((d) => (
                  <tr key={d.productId}>
                    <td className="font-semibold">{d.title}</td>
                    <td>{d.live ? <StatusChip tone="warn">◐ нет на складе</StatusChip> : <StatusChip tone="muted">○ скрыт</StatusChip>}</td>
                    <td className="r" title={`${num(d.views30)} просмотров`}>
                      {num(d.viewers30)} чел.
                    </td>
                    <td className="r">{num(d.cartAdds30)}</td>
                    <td className="r">{num(d.sold90)}</td>
                    <td className="r">{d.lastSoldDaysAgo == null ? "—" : `${num(d.lastSoldDaysAgo)} дн назад`}</td>
                    <td className="r">
                      <Link href={editHref(d.productId)} className="text-[12px] font-semibold text-[var(--accent-hi)] hover:underline">
                        Открыть
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
          {demandRows.toggle}
          </>
        )}
      </Panel>

      <DeadStockPanel s={s} deadDays={deadDays} setDeadDays={setDeadDays} />

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel
          title="Топ товаров"
          icon={Trophy}
          hint="За выбранный период, по товару (а не по названию), без отказов и подарков; выручка после скидок"
          actions={
            <SegmentedControl
              size="sm"
              options={[
                { value: "revenue", label: "₴" },
                { value: "units", label: "шт." },
              ]}
              value={topBy}
              onChange={setTopBy}
            />
          }
        >
          {top.length === 0 ? (
            <Empty>Продаж за период нет</Empty>
          ) : (
            <TableWrap>
              <table className="mx-table">
                <thead>
                  <tr>
                    <th>Товар</th>
                    <th className="w-[30%]" />
                    <th className="r">{topBy === "revenue" ? "Выручка" : "Шт."}</th>
                    <th className="r">{topBy === "revenue" ? "Шт." : "Выручка"}</th>
                    <th className="r">Остаток</th>
                  </tr>
                </thead>
                <tbody>
                  {top.map((t) => (
                    <tr key={t.productId}>
                      <td>
                        <Link href={editHref(t.productId)} className="font-semibold hover:underline">
                          {t.title}
                        </Link>
                        {!t.live && <span className="ml-1 text-[11px] text-[var(--text-faint)]">(скрыт)</span>}
                      </td>
                      <td>
                        <InlineBar value={topBy === "revenue" ? t.revenueMinor : t.units} max={topMax} />
                      </td>
                      <td className="r font-semibold">{topBy === "revenue" ? uahShort(t.revenueMinor) : num(t.units)}</td>
                      <td className="r text-[var(--text-muted)]">{topBy === "revenue" ? num(t.units) : uahShort(t.revenueMinor)}</td>
                      <td className="r">{num(t.stock)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
        </Panel>

        <Panel title="Склад по категориям" icon={Warehouse} hint="Остаток по розничной цене и на сколько дней его хватит при темпе последних 30 дней">
          <TableWrap>
            <table className="mx-table">
              <thead>
                <tr>
                  <th>Категория</th>
                  <th className="r">Товаров</th>
                  <th className="r">Шт.</th>
                  <th className="r">На сумму</th>
                  <th className="r">Дней запаса</th>
                </tr>
              </thead>
              <tbody>
                {s.categories.map((c) => (
                  <tr key={c.name}>
                    <td className="font-semibold">{c.name}</td>
                    <td className="r">{num(c.products)}</td>
                    <td className="r">{num(c.units)}</td>
                    <td className="r">{uahShort(c.valueMinor)}</td>
                    <td className="r">
                      {c.daysOfCover == null ? (
                        <span className="text-[var(--text-faint)]">не продаётся</span>
                      ) : c.daysOfCover > 180 ? (
                        <StatusChip tone="warn">◐ {num(Math.round(c.daysOfCover))}</StatusChip>
                      ) : (
                        num(Math.round(c.daysOfCover))
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </Panel>
      </div>

      <Panel title="Забытый сток" icon={Archive} hint="Скрытые и архивные товары, у которых остаток больше нуля: либо вернуть в продажу, либо обнулить остаток">
        {s.forgotten.length === 0 ? (
          <Empty>Нет</Empty>
        ) : (
          <>
          <TableWrap>
            <table className="mx-table">
              <thead>
                <tr>
                  <th>Товар</th>
                  <th>Где</th>
                  <th className="r">Остаток</th>
                  <th className="r">По рознице</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {forgottenRows.visible.map((f) => (
                  <tr key={f.productId}>
                    <td className="font-semibold">{f.title}</td>
                    <td className="text-[var(--text-muted)]">{f.archived ? "в архиве" : "скрыт"}</td>
                    <td className="r">{num(f.stock)}</td>
                    <td className="r">{uah(f.valueMinor)}</td>
                    <td className="r">
                      <Link href={editHref(f.productId)} className="text-[12px] font-semibold text-[var(--accent-hi)] hover:underline">
                        Открыть
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
          {forgottenRows.toggle}
          </>
        )}
      </Panel>
    </motion.div>
  );
}

function DeadStockPanel({ s, deadDays, setDeadDays }: { s: Stock; deadDays: number; setDeadDays: (n: number) => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [confirm, setConfirm] = useState<string | null>(null);
  const deadRows = useLimited(s.deadStock, 12);
  const hide = useMutation({
    mutationFn: (id: string) => metricsApi.hideProduct(id),
    onSuccess: () => {
      toast.push("Товар скрыт с витрины", "ok");
      setConfirm(null);
      void qc.invalidateQueries({ queryKey: ["metrics2", "stock"] });
    },
    onError: (e) => toast.push(e instanceof ApiError ? e.message : "Не удалось скрыть товар", "error"),
  });

  return (
    <Panel
      title="Не продаётся"
      icon={Snowflake}
      hint="Товары на витрине с остатком, которые не продавались выбранное число дней (новые товары моложе этого срока не считаются). Сумма — по розничной цене."
      actions={
        <div className="flex flex-wrap gap-2">
          {s.deadStockBuckets.map((b) => (
            <button
              key={b.days}
              type="button"
              onClick={() => setDeadDays(b.days)}
              aria-pressed={b.days === deadDays}
              className={`nb-chip nb-press mx-num px-3 py-1 text-left text-[12px] transition-colors ${
                b.days === deadDays ? "nb-chip-active" : "text-[var(--text-muted)] hover:border-[var(--border-2)] hover:text-[var(--text)]"
              }`}
            >
              {b.days}+ дн · {num(b.products)} · {uahShort(b.valueMinor)}
            </button>
          ))}
        </div>
      }
    >
      {s.deadStock.length === 0 ? (
        <Empty>Всё продаётся</Empty>
      ) : (
        <>
          <TableWrap>
          <table className="mx-table">
            <thead>
              <tr>
                <th>Товар</th>
                <th className="r">Остаток</th>
                <th className="r">Заморожено</th>
                <th className="r">Без продаж</th>
                <th className="r" title="Просмотры карточки за 30 дней">Просмотры</th>
                <th className="r" title="Добавления в корзину за 30 дней">В корзину</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {deadRows.visible.map((d) => (
                <tr key={d.productId}>
                  <td>
                    <div className="font-semibold">{d.title}</div>
                    {d.tags.length > 0 && <div className="text-[11px] text-[var(--text-faint)]">{d.tags.join(", ")}</div>}
                  </td>
                  <td className="r">{num(d.stock)}</td>
                  <td className="r font-semibold">{uah(d.valueMinor)}</td>
                  <td className="r">{d.neverSold ? `ни разу (${num(d.daysWithoutSale)} дн)` : `${num(d.daysWithoutSale)} дн`}</td>
                  <td className="r">{d.views30 == null ? "—" : num(d.views30)}</td>
                  <td className="r">{d.cartAdds30 == null ? "—" : num(d.cartAdds30)}</td>
                  <td className="r whitespace-nowrap">
                    <Link
                      href={editHref(d.productId)}
                      className="mr-2 inline-flex items-center gap-1 text-[12px] font-semibold text-[var(--accent-hi)] hover:underline"
                      title="Открыть товар: поставить старую цену (скидку) или уценить (состояние «Уценка»)"
                    >
                      <PackageX className="h-3.5 w-3.5" /> Скидка
                    </Link>
                    {confirm === d.productId ? (
                      <span className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          disabled={hide.isPending}
                          onClick={() => hide.mutate(d.productId)}
                          className="rounded-[var(--r-sm)] border border-[color-mix(in_srgb,var(--danger)_45%,transparent)] bg-[color-mix(in_srgb,var(--danger)_14%,transparent)] px-1.5 py-0.5 text-[12px] font-semibold text-[var(--danger-ink)] hover:bg-[color-mix(in_srgb,var(--danger)_24%,transparent)]"
                        >
                          Скрыть?
                        </button>
                        <button type="button" onClick={() => setConfirm(null)} className="text-[12px] text-[var(--text-muted)]">
                          нет
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirm(d.productId)}
                        className="inline-flex items-center gap-1 text-[12px] font-semibold text-[var(--text-muted)] hover:text-[var(--text)]"
                      >
                        <EyeOff className="h-3.5 w-3.5" /> Скрыть
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
          {deadRows.toggle}
          </>
      )}
    </Panel>
  );
}
