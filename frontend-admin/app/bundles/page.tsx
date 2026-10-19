"use client";

/**
 * «Вместе дешевле» (route "/bundles"): accessories with a discount next to a product.
 *  - «Скидки» are settings of the `bundles` group (GET/PUT /api/admin/settings, one save bar).
 *    The generic «Настройки» page hides this group.
 *  - «Пары категорий», «Предпросмотр», «Статистика» — /api/admin/bundles/*.
 *  - 2.0: маржа и потолки, замер B/H, прогноз, «что берут вместе», «Собери сетап», предупреждения
 *    (InsightsPanels.tsx).
 * One discount per order: the bundle or the promo code, whichever is better for the customer.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { BarChart3, FlaskConical, LayoutGrid, Percent, Save, Undo2 } from "lucide-react";
import { ApiError } from "@/lib/api";
import { BUNDLES_GROUP, bundlesApi } from "@/lib/bundles";
import { cn } from "@/lib/cn";
import { money } from "@/lib/money";
import { SETTINGS_QUERY_KEY, settingsApi, type SettingItem, type SettingValue } from "@/lib/settings";
import { useToast } from "@/lib/toast";
import { useUnsavedGuard } from "@/lib/use-unsaved-guard";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { QueryState } from "@/components/ui/QueryState";
import { Toggle } from "@/components/ui/Toggle";
import { initialDraft, isDirty, parse, validate, type Draft } from "../settings/draft";
import { PanelHeader } from "../settings/PanelHeader";
import { FunnelPanel, ForecastPanel, MarginsPanel, PairsPanel, WarningsPanel } from "./InsightsPanels";
import { PreviewPanel } from "./PreviewPanel";
import { RulesPanel } from "./RulesPanel";

const K = {
  enabled: "bundle.enabled",
  tier1: "bundle.tier1Percent",
  tier2: "bundle.tier2Percent",
  tier3: "bundle.tier3Percent",
  maxAddon: "bundle.maxAddonPricePercent",
  cap: "bundle.maxDiscountUah",
  suggestions: "bundle.maxSuggestions",
  safety: "bundle.safetyMarginPercent",
  holdout: "bundle.holdoutPercent",
  explore: "bundle.explorePercent",
  autoTune: "bundle.autoTune",
  lift: "bundle.liftPercent",
  response: "bundle.responsePercent",
  setupEnabled: "bundle.setupEnabled",
  setupPercent: "bundle.setupPercent",
} as const;

export default function BundlesPage() {
  const { push } = useToast();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: SETTINGS_QUERY_KEY, queryFn: settingsApi.list });
  const items = useMemo(() => (q.data?.items ?? []).filter((it) => it.group === BUNDLES_GROUP), [q.data]);
  const byKey = useMemo(() => new Map(items.map((it) => [it.key, it])), [items]);

  const [draft, setDraft] = useState<Draft>({});
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (q.data) setDraft(initialDraft(q.data.items.filter((it) => it.group === BUNDLES_GROUP)));
  }, [q.data]);

  const dirtyItems = useMemo(() => items.filter((it) => isDirty(it, draft[it.key])), [items, draft]);
  const invalid = dirtyItems.some((it) => validate(it, draft[it.key].raw));
  const dirty = dirtyItems.length > 0;
  useUnsavedGuard(dirty);

  const change = (key: string, raw: string | boolean) => setDraft((d) => ({ ...d, [key]: { raw, reset: false } }));
  const discard = () => setDraft(initialDraft(items));

  async function save() {
    if (!dirty || invalid) return;
    const values: Record<string, SettingValue | null> = {};
    for (const it of dirtyItems) values[it.key] = parse(it, draft[it.key].raw);
    setSaving(true);
    try {
      const fresh = await settingsApi.save(values);
      qc.setQueryData(SETTINGS_QUERY_KEY, fresh);
      qc.invalidateQueries({ queryKey: ["bundles"] });
      push(dirtyItems.length === 1 ? "Настройка сохранена" : `Сохранено настроек: ${dirtyItems.length}`, "ok");
    } catch (e) {
      push(e instanceof ApiError ? e.message : "Не удалось сохранить", "error");
    } finally {
      setSaving(false);
    }
  }

  const field = (key: string) => {
    const item = byKey.get(key);
    const entry = draft[key];
    return item && entry ? { item, entry } : null;
  };

  return (
    <div className="min-w-0">
      <PageHeader
        title="Вместе дешевле"
        subtitle="Скидка на аксессуары, купленные вместе с товаром."
      />

      <StatsStrip />
      <WarningsPanel />

      <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error} refetch={q.refetch} loadingLabel="Загрузка настроек">
        {items.length === 0 ? (
          <p className="panel p-4 text-[13px] text-[var(--text-muted)]">
            Сервер не отдал настройки «Вместе дешевле» — обновите бэкенд.
          </p>
        ) : (
          <div className="grid min-w-0 gap-4 lg:grid-cols-2 lg:items-start lg:gap-6">
            <div className="flex min-w-0 flex-col gap-4 lg:gap-6">
              {/* ---- Скидки ---- */}
              <section className="panel min-w-0 p-4 sm:p-5">
                <PanelHeader icon={Percent} title="Скидки" description="Сколько процентов даём на аксессуары и на какие." />
                <p className="mb-4 rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-[12.5px] leading-snug text-[var(--text-muted)]">
                  Скидка только на аксессуары, не на сам товар. С промокодом не суммируется — покупатель получает ту, что
                  выгоднее.
                </p>
                <div className="flex min-w-0 flex-col gap-4">
                  {field(K.enabled) && (
                    <BoolRow {...field(K.enabled)!} label="Включено" onChange={(v) => change(K.enabled, v)} />
                  )}
                  <div>
                    <div className="field-label mb-1.5">Скидка, если взять</div>
                    <div className="grid grid-cols-3 gap-2">
                      {([K.tier1, K.tier2, K.tier3] as const).map((key, i) => {
                        const f = field(key);
                        return f ? (
                          <NumField key={key} {...f} label={`${i + 1} ${i === 0 ? "аксессуар" : "аксессуара"}`} hideHint onChange={(v) => change(key, v)} />
                        ) : null;
                      })}
                    </div>
                  </div>
                  <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                    {field(K.maxAddon) && (
                      <NumField {...field(K.maxAddon)!} label="Аксессуар не дороже, % цены товара" onChange={(v) => change(K.maxAddon, v)} />
                    )}
                    {field(K.cap) && (
                      <NumField {...field(K.cap)!} label="Потолок скидки на заказ (0 — без)" onChange={(v) => change(K.cap, v)} />
                    )}
                    {field(K.suggestions) && (
                      <NumField {...field(K.suggestions)!} label="Сколько предлагать" onChange={(v) => change(K.suggestions, v)} />
                    )}
                  </div>
                </div>
              </section>

              {/* ---- Замер и автонастройка ---- */}
              <section className="panel min-w-0 p-4 sm:p-5">
                <PanelHeader
                  icon={FlaskConical}
                  title="Замер и автонастройка"
                  description="Запас от маржи, контрольная группа и чем считать оптимальную скидку."
                />
                <div className="flex min-w-0 flex-col gap-4">
                  {field(K.autoTune) && (
                    <BoolRow {...field(K.autoTune)!} label="Авто-потолки по марже" onChange={(v) => change(K.autoTune, v)} />
                  )}
                  <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                    {field(K.safety) && (
                      <NumField {...field(K.safety)!} label="Запас от маржи, п. п." onChange={(v) => change(K.safety, v)} />
                    )}
                    {field(K.holdout) && (
                      <NumField {...field(K.holdout)!} label="Контрольная группа, %" onChange={(v) => change(K.holdout, v)} />
                    )}
                    {field(K.explore) && (
                      <NumField {...field(K.explore)!} label="Проба второго товара, %" onChange={(v) => change(K.explore, v)} />
                    )}
                    {field(K.lift) && (
                      <NumField {...field(K.lift)!} label="Отклик без замера, %" onChange={(v) => change(K.lift, v)} />
                    )}
                    {field(K.response) && (
                      <NumField {...field(K.response)!} label="Рост на 1 п. п. скидки, %" onChange={(v) => change(K.response, v)} />
                    )}
                  </div>
                </div>
              </section>

              {/* ---- Собери сетап ---- */}
              <section className="panel min-w-0 p-4 sm:p-5">
                <PanelHeader
                  icon={LayoutGrid}
                  title="Собери сетап"
                  description="Крупные товары в цвет рядом с товаром (мышь → клавиатура). Видят все, без контрольной группы."
                />
                <div className="flex min-w-0 flex-col gap-4">
                  {field(K.setupEnabled) && (
                    <BoolRow {...field(K.setupEnabled)!} label="Показывать" onChange={(v) => change(K.setupEnabled, v)} />
                  )}
                  {field(K.setupPercent) && (
                    <NumField
                      {...field(K.setupPercent)!}
                      label="Скидка в сетапе, % (0 — без скидки)"
                      onChange={(v) => change(K.setupPercent, v)}
                    />
                  )}
                </div>
              </section>

              <MarginsPanel />
              <ForecastPanel />
            </div>

            <div className="flex min-w-0 flex-col gap-4 lg:gap-6">
              <RulesPanel />
              <PreviewPanel />
              <FunnelPanel />
              <PairsPanel />
              <RulesPanel kind="setup" />
            </div>
          </div>
        )}
      </QueryState>

      <AnimatePresence>
        {dirty && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
            style={{ bottom: "calc(var(--bottom-nav) + 12px)" }}
            className="elevated sticky z-[55] mt-6 px-4 py-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0 text-[13px] font-semibold text-[var(--text)]">
                Несохранённых изменений: {dirtyItems.length}
                {invalid && <span className="block text-[12px] font-semibold text-[var(--danger-ink)]">Исправьте поля с ошибками</span>}
              </div>
              <div className="flex flex-1 justify-end gap-2 sm:flex-none">
                <Button variant="outline" icon={<Undo2 className="h-4 w-4" />} onClick={discard} disabled={saving}>
                  Отменить
                </Button>
                <Button variant="accent" icon={<Save className="h-4 w-4" />} loading={saving} disabled={invalid} onClick={save}>
                  Сохранить
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

type FieldProps = { item: SettingItem; entry: Draft[string] };

function NumField({
  item,
  entry,
  label,
  hideHint,
  onChange,
}: FieldProps & { label: string; hideHint?: boolean; onChange: (raw: string) => void }) {
  const error = validate(item, entry.raw) ?? undefined;
  const dirty = isDirty(item, entry);
  const range = item.min != null && item.max != null ? `${item.min}…${item.max}` : null;
  return (
    <div className={cn("min-w-0", dirty && "[&_.group]:!border-[rgba(255,102,0,.55)]")}>
      <Input
        label={label}
        inputMode="numeric"
        value={String(entry.raw)}
        onChange={(e) => onChange(e.target.value.replace(/[^\d-]/g, ""))}
        error={error}
        hint={hideHint ? undefined : [item.description, range && !item.description?.includes(range) ? `(${range})` : null].filter(Boolean).join(" ") || undefined}
        rightSlot={
          item.unit ? (
            <span className="font-display text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-faint)]">{item.unit}</span>
          ) : undefined
        }
      />
    </div>
  );
}

function BoolRow({ item, entry, label, onChange }: FieldProps & { label: string; onChange: (v: boolean) => void }) {
  const dirty = isDirty(item, entry);
  return (
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
      <Toggle checked={Boolean(entry.raw)} onChange={onChange} label={label} />
      {dirty && <Badge tone="accent">Не сохранено</Badge>}
    </div>
  );
}

function StatsStrip() {
  const q = useQuery({ queryKey: ["bundles", "stats"], queryFn: bundlesApi.stats, staleTime: 60_000 });
  const s = q.data;
  const share = s && s.orders > 0 ? Math.round((s.bundleOrders / s.orders) * 100) : 0;
  const tiles = [
    { label: "Заказы со скидкой", value: s ? `${s.bundleOrders} из ${s.orders}` : "—", hint: s ? `${share}% заказов` : undefined },
    { label: "Скидка отдана", value: s ? money(s.bundleDiscountMinor) : "—" },
    { label: "Выручка этих заказов", value: s ? money(s.bundleRevenueMinor) : "—" },
  ];
  return (
    <section className="mb-4 min-w-0 lg:mb-6" aria-label="Статистика за 30 дней">
      <div className="mb-2 flex items-center gap-2 text-[var(--text-muted)]">
        <BarChart3 className="h-4 w-4" />
        <span className="field-label">Статистика за 30 дней</span>
        {q.isError && <span className="text-[12px] text-[var(--danger-ink)]">не загрузилась</span>}
      </div>
      <div className={cn("grid min-w-0 grid-cols-2 gap-2 lg:gap-3", "sm:grid-cols-3")}>
        {tiles.map((t, i) => (
          <div
            key={t.label}
            className={cn("card-2 min-w-0 px-3 py-2.5", i === tiles.length - 1 && "col-span-2 sm:col-span-1")}
          >
            <div className="text-[11.5px] leading-tight text-[var(--text-faint)]">{t.label}</div>
            <div className={cn("tabular mt-1 break-words font-display text-[18px] font-bold leading-tight text-[var(--ink)]", q.isLoading && "opacity-40")}>
              {t.value}
            </div>
            {t.hint && <div className="mt-0.5 text-[11.5px] text-[var(--text-faint)]">{t.hint}</div>}
          </div>
        ))}
      </div>
    </section>
  );
}
