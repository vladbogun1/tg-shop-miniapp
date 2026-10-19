"use client";

/**
 * «Вместе дешевле» 2.0 — the panels around the numbers (docs/BUNDLES.md):
 *  - MarginsPanel — margin per category → the most discount it may get (margin − safety); manual
 *    cap or auto-tune; «Пересчитать» runs the auto-tune now (it also runs every Monday).
 *  - ForecastPanel — what the current caps give per month in three scenarios.
 *  - FunnelPanel — the group with the block (B) vs the control group (H): visitors → added → ordered,
 *    the lift, the slot positions.
 *  - PairsPanel — which categories are bought together (180 days) and pairs worth adding.
 *  - WarningsPanel — what silently breaks the offer (a hit ran out, a category with cap 0…).
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, Calculator, Gauge, GitCompareArrows, Plus, Sparkles, TrendingUp } from "lucide-react";
import { ApiError } from "@/lib/api";
import { bundlesApi, type BundleMargin, type BundlePairStat } from "@/lib/bundles";
import { cn } from "@/lib/cn";
import { money } from "@/lib/money";
import { useToast } from "@/lib/toast";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { QueryState } from "@/components/ui/QueryState";
import { PanelHeader } from "../settings/PanelHeader";
import { RULES_KEY } from "./RulesPanel";

const MARGINS_KEY = ["bundles", "margins"] as const;
const SOURCE: Record<BundleMargin["capSource"], string> = { MANUAL: "вручную", AUTO: "авто", MAX: "максимум" };

const num = (raw: string): number | null => (raw.trim() === "" ? null : Math.max(0, Math.round(Number(raw)) || 0));

// ---- margins ----

export function MarginsPanel() {
  const qc = useQueryClient();
  const { push } = useToast();
  const q = useQuery({ queryKey: MARGINS_KEY, queryFn: bundlesApi.margins });
  const [busy, setBusy] = useState<string | null>(null);
  const [tuning, setTuning] = useState(false);
  const [tuneNote, setTuneNote] = useState<string | null>(null);

  // Parents first, children right under them.
  const rows = useMemo(() => {
    const all = q.data ?? [];
    const tops = all.filter((m) => !m.parentId);
    const out: BundleMargin[] = [];
    for (const t of tops) out.push(t, ...all.filter((m) => m.parentId === t.categoryId));
    for (const m of all) if (!out.includes(m)) out.push(m);
    return out;
  }, [q.data]);

  async function save(m: BundleMargin, marginPercent: number | null, discountPercent: number | null) {
    if (marginPercent === m.marginPercent && discountPercent === m.discountPercent) return;
    setBusy(m.categoryId);
    try {
      const fresh = await bundlesApi.saveMargin({ categoryId: m.categoryId, marginPercent, discountPercent });
      qc.setQueryData(MARGINS_KEY, fresh);
      qc.invalidateQueries({ queryKey: ["bundles", "preview"] });
      qc.invalidateQueries({ queryKey: ["bundles", "forecast"] });
      push(`«${m.categoryName}» сохранено`, "ok");
    } catch (e) {
      push(e instanceof ApiError ? e.message : "Не удалось сохранить", "error");
    } finally {
      setBusy(null);
    }
  }

  async function autotune() {
    setTuning(true);
    try {
      const r = await bundlesApi.autotune();
      const changed = r.rows.filter((x) => x.oldPercent !== x.newPercent).length;
      setTuneNote(
        `Пересчитано: ${r.rows.length} категорий, изменено ${changed}. Отклик ${(r.liftUsed * 100).toFixed(0)}% (${
          r.liftSource === "MEASURED" ? "замер" : "из настроек"
        }), чувствительность ${(r.responsePerPoint * 100).toFixed(0)}%/п.п.`,
      );
      qc.invalidateQueries({ queryKey: MARGINS_KEY });
      qc.invalidateQueries({ queryKey: ["bundles", "forecast"] });
      qc.invalidateQueries({ queryKey: ["bundles", "preview"] });
    } catch (e) {
      push(e instanceof ApiError ? e.message : "Не удалось пересчитать", "error");
    } finally {
      setTuning(false);
    }
  }

  return (
    <section className="panel min-w-0 p-4 sm:p-5">
      <PanelHeader
        icon={Gauge}
        title="Маржа и потолок скидки"
        description="Скидка на аксессуар не больше «маржа − запас». Пусто — берётся у родителя или средняя маржа магазина. «Вручную» — свой потолок вместо авто."
      />
      <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error} refetch={q.refetch} loadingLabel="Загрузка маржей">
        <div className="min-w-0 overflow-x-auto">
          <table className="w-full min-w-[460px] text-[13px]">
            <thead>
              <tr className="text-left text-[11.5px] text-[var(--text-faint)]">
                <th className="py-1.5 pr-2 font-semibold">Категория</th>
                <th className="w-[84px] py-1.5 pr-2 font-semibold">Маржа %</th>
                <th className="w-[84px] py-1.5 pr-2 font-semibold">Вручную %</th>
                <th className="py-1.5 font-semibold">Потолок</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <MarginRow key={m.categoryId} m={m} busy={busy === m.categoryId} onSave={save} />
              ))}
            </tbody>
          </table>
        </div>
      </QueryState>
      <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-[var(--line)] pt-3">
        <Button variant="surface" size="sm" icon={<Calculator className="h-4 w-4" />} loading={tuning} onClick={autotune}>
          Пересчитать авто
        </Button>
        <span className="min-w-0 flex-1 text-[12px] leading-snug text-[var(--text-faint)]">
          {tuneNote ?? "Авто: d* = m/2 − (1+r)/(2e), не больше потолка. Само считается по понедельникам; только для категорий с маржой."}
        </span>
      </div>
    </section>
  );
}

function MarginRow({
  m,
  busy,
  onSave,
}: {
  m: BundleMargin;
  busy: boolean;
  onSave: (m: BundleMargin, margin: number | null, discount: number | null) => void;
}) {
  const [margin, setMargin] = useState(m.marginPercent == null ? "" : String(m.marginPercent));
  const [manual, setManual] = useState(m.discountPercent == null ? "" : String(m.discountPercent));
  const commit = () => onSave(m, num(margin), num(manual));
  const cell =
    "tabular h-8 w-full rounded-[var(--r-sm)] border border-[var(--line)] bg-[var(--surface-2)] px-2 text-[13px] text-[var(--text)] focus:border-[var(--accent)] focus:outline-none";
  return (
    <tr className={cn("border-t border-[var(--line)]", busy && "opacity-50")}>
      <td className={cn("py-1.5 pr-2", m.parentId && "pl-4")}>
        <span className={cn("break-words", m.parentId ? "text-[var(--text-muted)]" : "font-semibold text-[var(--text)]")}>
          {m.categoryName}
        </span>
      </td>
      <td className="py-1.5 pr-2">
        <input
          aria-label={`Маржа «${m.categoryName}», %`}
          inputMode="numeric"
          className={cell}
          placeholder={String(m.effectiveMarginPercent)}
          value={margin}
          onChange={(e) => setMargin(e.target.value.replace(/[^\d]/g, ""))}
          onBlur={commit}
          onKeyDown={(e) => e.key === "Enter" && commit()}
        />
      </td>
      <td className="py-1.5 pr-2">
        <input
          aria-label={`Свой потолок «${m.categoryName}», %`}
          inputMode="numeric"
          className={cell}
          placeholder="—"
          value={manual}
          onChange={(e) => setManual(e.target.value.replace(/[^\d]/g, ""))}
          onBlur={commit}
          onKeyDown={(e) => e.key === "Enter" && commit()}
        />
      </td>
      <td className="whitespace-nowrap py-1.5">
        <b className={cn("tabular", m.capPercent > 0 ? "text-[var(--ok)]" : "text-[var(--text-faint)]")}>−{m.capPercent}%</b>{" "}
        <span className="text-[11.5px] text-[var(--text-faint)]">
          {SOURCE[m.capSource]}
          {m.capSource !== "MAX" && ` · макс ${m.maxPercent}`}
        </span>
      </td>
    </tr>
  );
}

// ---- forecast ----

export function ForecastPanel() {
  const q = useQuery({ queryKey: ["bundles", "forecast"], queryFn: bundlesApi.forecast, staleTime: 60_000 });
  const f = q.data;
  return (
    <section className="panel min-w-0 p-4 sm:p-5">
      <PanelHeader
        icon={TrendingUp}
        title="Прогноз на месяц"
        description="По заказам за 180 дней и текущим потолкам: сколько заказов возьмут аксессуар и что останется после скидки."
      />
      <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error} refetch={q.refetch} loadingLabel="Считаем прогноз">
        {f && (
          <>
            <p className="mb-3 text-[12.5px] leading-snug text-[var(--text-muted)]">
              ~{f.ordersPerMonth} заказов в месяц, сейчас с аксессуаром {(f.baseAttachRate * 100).toFixed(1)}%, средний аксессуар{" "}
              {money(f.avgAddonMinor)}, средняя скидка {f.avgPercent}% при марже {f.avgMarginPercent}%.
            </p>
            <div className="grid min-w-0 gap-2 sm:grid-cols-3">
              {f.scenarios.map((s) => (
                <div key={s.key} className="card-2 min-w-0 px-3 py-2.5">
                  <div className="text-[11.5px] font-semibold text-[var(--text-faint)]">{s.label}</div>
                  <div
                    className={cn(
                      "tabular mt-1 font-display text-[18px] font-bold leading-tight",
                      s.profitMinor >= 0 ? "text-[var(--ok)]" : "text-[var(--danger-ink)]",
                    )}
                  >
                    {s.profitMinor >= 0 ? "+" : "−"}
                    {money(Math.abs(s.profitMinor))}
                  </div>
                  <div className="mt-0.5 text-[11.5px] leading-snug text-[var(--text-faint)]">
                    +{s.extraAddonOrders} заказов с аксессуаром · скидки {money(s.discountMinor)} · выручка {money(s.revenueMinor)}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </QueryState>
    </section>
  );
}

// ---- funnel ----

export function FunnelPanel() {
  const q = useQuery({ queryKey: ["bundles", "funnel"], queryFn: bundlesApi.funnel, staleTime: 60_000 });
  const f = q.data;
  const b = f?.groups.find((g) => g.group === "B");
  const h = f?.groups.find((g) => g.group === "H");
  const pct = (a: number, z: number) => (z > 0 ? `${((a / z) * 100).toFixed(1)}%` : "—");
  return (
    <section className="panel min-w-0 p-4 sm:p-5">
      <PanelHeader
        icon={GitCompareArrows}
        title="Замер за 30 дней"
        description="Блок видит группа B; контрольная H — нет. Разница в заказах с аксессуаром — то, что реально даёт блок."
      />
      <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error} refetch={q.refetch} loadingLabel="Загрузка замера">
        {f && (
          <>
            <div className="min-w-0 overflow-x-auto">
              <table className="tabular w-full min-w-[420px] text-[13px]">
                <thead>
                  <tr className="text-left text-[11.5px] text-[var(--text-faint)]">
                    <th className="py-1.5 pr-2 font-semibold">Группа</th>
                    <th className="py-1.5 pr-2 font-semibold">Посетители</th>
                    <th className="py-1.5 pr-2 font-semibold">Видели</th>
                    <th className="py-1.5 pr-2 font-semibold">Добавили</th>
                    <th className="py-1.5 font-semibold">Заказ с аксесс.</th>
                  </tr>
                </thead>
                <tbody>
                  {[b, h].filter(Boolean).map((g) => (
                    <tr key={g!.group} className="border-t border-[var(--line)]">
                      <td className="py-1.5 pr-2 font-semibold text-[var(--text)]">{g!.group === "B" ? "B — с блоком" : "H — контроль"}</td>
                      <td className="py-1.5 pr-2">{g!.visitors}</td>
                      <td className="py-1.5 pr-2">{g!.withOffer}</td>
                      <td className="py-1.5 pr-2">
                        {g!.added} <span className="text-[var(--text-faint)]">{pct(g!.added, g!.withOffer)}</span>
                      </td>
                      <td className="py-1.5">
                        {g!.addonOrders} <span className="text-[var(--text-faint)]">из {g!.orders} · {pct(g!.addonOrders, g!.visitors)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[12.5px] leading-snug text-[var(--text-muted)]">
              {f.liftPercent != null ? (
                <>
                  Блок добавляет <b className={f.liftPercent >= 0 ? "text-[var(--ok)]" : "text-[var(--danger-ink)]"}>{f.liftPercent.toFixed(1)}%</b>{" "}
                  заказов с аксессуаром.
                </>
              ) : (
                `Для вывода нужно хотя бы ${f.minVisitors} посетителей в каждой группе — пока считаем по настройке «Отклик».`
              )}
            </p>
            {f.bySlot.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {f.bySlot.map((s) => (
                  <Badge key={s.key}>
                    {slotLabel(s.key)}: {s.adds}/{s.views}
                  </Badge>
                ))}
                {f.explores > 0 && (
                  <Badge tone="accent">
                    проба: {f.exploreAdds}/{f.explores}
                  </Badge>
                )}
              </div>
            )}
          </>
        )}
      </QueryState>
    </section>
  );
}

function slotLabel(key: string): string {
  const m = /^slot(\d+)$/.exec(key);
  if (m) return `слот ${m[1]}`;
  return ({ primary: "основной", color: "другой цвет", alt: "альтернатива", setup: "сетап", cart: "корзина" } as Record<string, string>)[key] ?? key;
}

// ---- pairs ----

export function PairsPanel() {
  const qc = useQueryClient();
  const { push } = useToast();
  const q = useQuery({ queryKey: ["bundles", "pairs"], queryFn: bundlesApi.pairs, staleTime: 60_000 });
  const [busy, setBusy] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const list = q.data ?? [];
  const shown = all ? list : list.filter((p) => p.suggested || p.ruleId != null).slice(0, 12);

  async function add(p: BundlePairStat) {
    const key = p.sourceCategoryId + p.targetCategoryId;
    setBusy(key);
    try {
      await bundlesApi.createRule({ sourceCategoryId: p.sourceCategoryId, targetCategoryId: p.targetCategoryId, active: true, sortOrder: 1000 });
      push("Пара добавлена", "ok");
      qc.invalidateQueries({ queryKey: RULES_KEY });
      qc.invalidateQueries({ queryKey: ["bundles", "pairs"] });
    } catch (e) {
      push(e instanceof ApiError ? e.message : "Не удалось добавить", "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="panel min-w-0 p-4 sm:p-5">
      <PanelHeader
        icon={Sparkles}
        title="Что берут вместе"
        description="Пары категорий из заказов за 180 дней. «Добавить» — часто берут вместе, а пары нет."
      />
      <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error} refetch={q.refetch} loadingLabel="Загрузка пар">
        {shown.length === 0 ? (
          <p className="card-2 p-3 text-[13px] text-[var(--text-muted)]">Пока мало заказов, чтобы что-то сказать.</p>
        ) : (
          <ul className="flex min-w-0 flex-col gap-1.5">
            {shown.map((p) => (
              <li key={p.sourceCategoryId + p.targetCategoryId} className="card-2 flex min-w-0 items-center gap-2 py-1.5 pl-3 pr-1.5">
                <div className="min-w-0 flex-1 text-[13px] leading-snug">
                  <span className="font-semibold text-[var(--text)]">{p.sourceCategoryName}</span>
                  <ArrowRight className="mx-1 inline h-3.5 w-3.5 align-[-2px] text-[var(--accent-hi)]" aria-label="→" />
                  <span className="text-[var(--text)]">{p.targetCategoryName}</span>
                  <span className="tabular ml-1.5 text-[11.5px] text-[var(--text-faint)]">
                    {(p.rate * 100).toFixed(0)}% · {p.together} из {p.anchorOrders}
                  </span>
                </div>
                {p.ruleId != null ? (
                  <Badge tone={p.ruleActive ? "ok" : "neutral"}>{p.ruleActive ? "есть пара" : "пара выкл."}</Badge>
                ) : p.setupRule ? (
                  <Badge>сетап</Badge>
                ) : p.suggested ? (
                  <Button
                    size="sm"
                    variant="accent"
                    icon={<Plus className="h-3.5 w-3.5" />}
                    loading={busy === p.sourceCategoryId + p.targetCategoryId}
                    onClick={() => add(p)}
                  >
                    Добавить
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {list.length > shown.length && !all && (
          <button
            type="button"
            onClick={() => setAll(true)}
            className="focusable hit mt-2 text-[12px] font-semibold text-[var(--text-faint)] hover:text-[var(--text)]"
          >
            Показать все ({list.length})
          </button>
        )}
      </QueryState>
    </section>
  );
}

// ---- warnings ----

export function WarningsPanel() {
  const q = useQuery({ queryKey: ["bundles", "warnings"], queryFn: bundlesApi.warnings, staleTime: 60_000 });
  const list = q.data ?? [];
  if (q.isLoading || q.isError || list.length === 0) return null;
  return (
    <section className="panel mb-4 min-w-0 p-4 sm:p-5 lg:mb-6" aria-label="Предупреждения">
      <PanelHeader icon={AlertTriangle} title="Требует внимания" description="Что сейчас мешает предложению." />
      <ul className="flex min-w-0 flex-col gap-1.5">
        {list.map((w, i) => (
          <li key={w.code + i} className="flex min-w-0 items-start gap-2 text-[13px] leading-snug">
            <Badge tone={w.level === "WARN" ? "warn" : "info"}>{w.level === "WARN" ? "важно" : "к сведению"}</Badge>
            <span className="min-w-0 flex-1 break-words text-[var(--text)]">{w.text}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
