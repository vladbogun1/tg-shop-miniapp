"use client";

/**
 * «Кейс» (route "/gift"): the gift for the order sum — a fixed product or a CS-style case.
 *  - The switch, the threshold, the gift product and the case mode are settings of the `gift` group
 *    (GET/PUT /api/admin/settings, one save bar). The generic «Настройки» page hides this group.
 *  - The three case tiers (threshold, guaranteed discount, swap, promo validity), their prizes and the
 *    stats — /api/admin/gift/*: CasePanel, the case builder (prizes in a draft, «Опубликовать»), full width
 *    under the settings.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { AlertTriangle, BarChart3, FileSpreadsheet, Gift, Save, Undo2 } from "lucide-react";
import { adminApi, ApiError } from "@/lib/api";
import { CASE_TIER_LABEL, GIFT_GROUP, giftApi } from "@/lib/gift";
import { CASE_TIER_METAL } from "@shop/core/giftcase";
import { cn } from "@/lib/cn";
import { Image } from "@/lib/image";
import { money } from "@/lib/money";
import { productStock } from "@/lib/stock";
import { initialDraft, isDirty, parse, settingsApi, settingsKeys, validate, type Draft, type SettingItem, type SettingValue } from "@/features/settings";
import { toast } from "@shop/ui/toast";
import { useUnsavedGuard } from "@/lib/use-unsaved-guard";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@shop/ui/admin-button";
import { Input } from "@/components/ui/Input";
import { QueryState } from "@/components/ui/QueryState";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Toggle } from "@/components/ui/Toggle";
import { PanelHeader } from "@/components/ui/PanelHeader";
import { ProductPickModal } from "@/components/ProductPickModal";
import { CasePanel } from "./CasePanel";
import { LowMarginPanel } from "./LowMarginPanel";

const K = {
  giftEnabled: "gift.enabled",
  giftThreshold: "gift.thresholdUah",
  giftProduct: "gift.productId",
  giftCase: "gift.caseEnabled",
  promoReminder: "gift.promoReminderDays",
  margin: "gift.marginPercent",
  monthlyLimit: "gift.monthlyLimitUah",
} as const;

export default function GiftPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: settingsKeys.all(), queryFn: settingsApi.list });
  const items = useMemo(() => (q.data?.items ?? []).filter((it) => it.group === GIFT_GROUP), [q.data]);
  const byKey = useMemo(() => new Map(items.map((it) => [it.key, it])), [items]);

  const [draft, setDraft] = useState<Draft>({});
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (q.data) setDraft(initialDraft(q.data.items.filter((it) => it.group === GIFT_GROUP)));
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
      qc.setQueryData(settingsKeys.all(), fresh);
      qc.invalidateQueries({ queryKey: ["gift"] });
      toast.success(dirtyItems.length === 1 ? "Настройка сохранена" : `Сохранено настроек: ${dirtyItems.length}`);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  }

  const isCase = Boolean(draft[K.giftCase]?.raw);
  const savedReminder = byKey.get(K.promoReminder)?.value;
  const reminderDays = typeof savedReminder === "number" ? savedReminder : null;

  const field = (key: string) => {
    const item = byKey.get(key);
    const entry = draft[key];
    return item && entry ? { item, entry } : null;
  };

  return (
    <div className="min-w-0">
      <PageHeader
        title="Кейс"
        subtitle="Подарок за сумму заказа: один товар или бронзовый, серебряный и золотой кейсы со случайным призом."
        actions={
          <Link
            href="/gift/registry"
            className="inline-flex min-h-[40px] items-center gap-2 rounded-[10px] border border-[var(--line)] px-3 text-[13px] font-semibold text-[var(--text)] hover:border-[var(--accent)] hover:text-[var(--accent-hi)]"
          >
            <FileSpreadsheet className="h-4 w-4" />
            Реестр подарков
          </Link>
        }
      />

      <StatsStrip />

      <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error} refetch={q.refetch} loadingLabel="Загрузка настроек">
        {items.length === 0 ? (
          <p className="panel p-4 text-[13px] text-[var(--text-muted)]">
            Сервер не отдал настройки подарка — обновите бэкенд.
          </p>
        ) : (
          <div className="min-w-0 max-w-3xl">
            <GiftSection
              enabled={field(K.giftEnabled)}
              threshold={field(K.giftThreshold)}
              caseMode={field(K.giftCase)}
              productId={String(draft[K.giftProduct]?.raw ?? "")}
              productDirty={!!byKey.get(K.giftProduct) && isDirty(byKey.get(K.giftProduct)!, draft[K.giftProduct])}
              reminder={field(K.promoReminder)}
              margin={field(K.margin)}
              monthlyLimit={field(K.monthlyLimit)}
              onChange={change}
            />
          </div>
        )}
        {isCase && (
          <section className="panel mt-4 min-w-0 p-4 sm:p-5">
            <CasePanel reminderDays={reminderDays} />
          </section>
        )}
        {isCase && <LowMarginPanel />}
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

function GiftSection({
  enabled,
  threshold,
  caseMode,
  productId,
  productDirty,
  reminder,
  margin,
  monthlyLimit,
  onChange,
}: {
  enabled: FieldProps | null;
  threshold: FieldProps | null;
  /** `gift.caseEnabled`: null = an old backend without the case. */
  caseMode: FieldProps | null;
  productId: string;
  productDirty: boolean;
  /** gift.promoReminderDays / gift.marginPercent: null = an old backend. */
  reminder: FieldProps | null;
  margin: FieldProps | null;
  /** gift.monthlyLimitUah: null = an old backend. */
  monthlyLimit: FieldProps | null;
  onChange: (key: string, raw: string | boolean) => void;
}) {
  const [picking, setPicking] = useState(false);
  const productsQ = useQuery({ queryKey: ["products"], queryFn: () => adminApi.products(), staleTime: 60_000 });
  const product = productId ? productsQ.data?.find((p) => p.id === productId) ?? null : null;
  const stock = product ? productStock(product) : 0;
  const variants = product?.variants ?? [];
  const best = variants.length ? [...variants].sort((a, b) => (b.stock ?? 0) - (a.stock ?? 0))[0] : null;
  const on = !!enabled && Boolean(enabled.entry.raw);
  const isCase = !!caseMode && Boolean(caseMode.entry.raw);

  return (
    <section className="panel min-w-0 p-4 sm:p-5">
      <PanelHeader
        icon={Gift}
        title="Подарок за сумму"
        description={
          isCase
            ? "Кейс, который магазин сам кладёт в заказ от суммы (после скидки). Пороги — у каждого кейса ниже."
            : "Товар, который магазин сам кладёт в заказ от указанной суммы (после скидки)."
        }
      />
      <div className="flex min-w-0 flex-col gap-4">
        {enabled && <BoolRow {...enabled} label="Включено" onChange={(v) => onChange(K.giftEnabled, v)} />}
        {threshold && (
          <div className="max-w-[260px]">
            <NumField
              {...threshold}
              label={isCase ? "Порог запасного товара-подарка" : "Порог суммы заказа"}
              hideHint
              onChange={(v) => onChange(K.giftThreshold, v)}
            />
          </div>
        )}

        {caseMode && (
          <div>
            <div className="mb-1.5 flex items-center gap-2">
              <span className="field-label">Что получает покупатель</span>
              {isDirty(caseMode.item, caseMode.entry) && <Badge tone="accent">Не сохранено</Badge>}
            </div>
            <SegmentedControl
              value={isCase ? "case" : "one"}
              onChange={(v) => onChange(K.giftCase, v === "case")}
              options={[
                { value: "one", label: "Один товар" },
                { value: "case", label: "Кейс" },
              ]}
            />
            <p className="mt-1.5 text-[12.5px] leading-snug text-[var(--text-muted)]">
              {isCase
                ? "Кейс как в CS: приз (товар или скидка) случайно выбирается при оформлении, покупатель открывает кейс в заказе. Вместо кейса можно предложить гарантированную скидку."
                : "В заказ всегда кладётся один и тот же товар."}
            </p>
          </div>
        )}

        <div>
          <div className="mb-1.5 flex items-center gap-2">
            <span className="field-label">{isCase ? "Запасной товар-подарок" : "Товар-подарок"}</span>
            {productDirty && <Badge tone="accent">Не сохранено</Badge>}
          </div>
          <div className="card-2 flex min-w-0 items-center gap-3 p-2.5">
            {product ? (
              <>
                <Image
                  src={product.images?.[0]?.url}
                  alt={product.title}
                  size={120}
                  className="h-14 w-14 shrink-0 rounded-[var(--r-sm)] border border-[var(--line)] bg-[var(--surface-3)]"
                />
                <div className="min-w-0 flex-1">
                  <div className="line-clamp-2 break-words text-[14px] font-semibold leading-snug text-[var(--text)]">{product.title}</div>
                  <div className="tabular mt-0.5 text-[12px] text-[var(--text-faint)]">
                    {money(product.priceMinor, product.currency)} ·{" "}
                    <span className={stock <= 0 ? "font-semibold text-[var(--danger-ink)]" : undefined}>
                      {stock <= 0 ? "нет в наличии" : `${stock} шт`}
                    </span>
                  </div>
                </div>
              </>
            ) : (
              <div className="min-w-0 flex-1 text-[13px] text-[var(--text-muted)]">
                {productId ? (productsQ.isLoading ? "Загрузка…" : "Товар не найден (удалён?)") : "Товар не выбран"}
              </div>
            )}
            <Button size="sm" variant="surface" className="shrink-0" onClick={() => setPicking(true)}>
              {productId ? "Другой" : "Выбрать"}
            </Button>
          </div>

          {product && on && stock <= 0 && (
            <Warn>Подарка нет на складе — покупатели его не увидят, пока не появится.</Warn>
          )}
          {product && (product.archived || product.active === false) && <Warn>Товар скрыт из каталога — проверьте, что это нужный товар.</Warn>}
          {product && best && (
            <Warn tone="info">
              У товара есть варианты — в заказ попадёт тот, которого больше всего на складе
              {best.stock ? ` (сейчас «${best.name}», ${best.stock} шт)` : ""}.
            </Warn>
          )}
          {on && !productId && !isCase && <Warn>Подарок включён, но товар не выбран — подарка не будет.</Warn>}
          {isCase && (
            <Warn tone="info">
              Кладётся от своего порога, если ни один кейс разыграть нельзя (выключены или нет призов)
              {productId ? "" : " — сейчас не выбран, тогда подарка не будет"}.
            </Warn>
          )}
        </div>

        {isCase && (reminder || margin) && (
          <div className="grid min-w-0 grid-cols-1 gap-3 border-t border-[var(--line)] pt-4 min-[480px]:grid-cols-2">
            {reminder && (
              <NumField {...reminder} label="Напомнить о промокоде из кейса" onChange={(v) => onChange(K.promoReminder, v)} />
            )}
            {margin && <NumField {...margin} label="Средняя маржа товаров" onChange={(v) => onChange(K.margin, v)} />}
          </div>
        )}

        {on && monthlyLimit && (
          <div className="border-t border-[var(--line)] pt-4">
            <NumField
              {...monthlyLimit}
              label="Лимит подарков на человека в месяц"
              onChange={(v) => onChange(K.monthlyLimit, v)}
            />
          </div>
        )}
      </div>

      <ProductPickModal
        open={picking}
        title="Товар-подарок"
        selectedId={productId}
        onClose={() => setPicking(false)}
        onPick={(p) => onChange(K.giftProduct, p.id)}
      />
    </section>
  );
}

function Warn({ children, tone = "warn" }: { children: React.ReactNode; tone?: "warn" | "info" }) {
  return (
    <p
      className={cn(
        "mt-2 flex items-start gap-2 text-[12.5px] leading-snug",
        tone === "warn" ? "text-[var(--warn)]" : "text-[var(--text-muted)]"
      )}
    >
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span className="min-w-0">{children}</span>
    </p>
  );
}

function StatsStrip() {
  const q = useQuery({ queryKey: ["gift", "stats"], queryFn: giftApi.stats, staleTime: 60_000 });
  const s = q.data;
  const share = s && s.orders > 0 ? Math.round((s.giftOrders / s.orders) * 100) : 0;
  const tiles = [
    { label: "Заказов с подарком", value: s ? `${s.giftOrders} из ${s.orders}` : "—", hint: s ? `${share}% заказов` : undefined },
    { label: "Кейсов открыто", value: s ? `${s.casesOpened} из ${s.caseOrders}` : "—", hint: "покупатель открыл в заказе" },
    {
      label: "Скидка вместо кейса",
      value: s ? String(s.guaranteedOrders ?? 0) : "—",
      hint: s && (s.guaranteedMinor ?? 0) > 0 ? `на ${money(s.guaranteedMinor!)}` : undefined,
    },
    {
      label: "Призов-скидок / замен",
      value: s ? `${s.discountPrizes ?? 0} / ${s.swaps ?? 0}` : "—",
      hint: "выпало скидок / заменено товаров",
    },
  ];
  const tiers = s?.tiers?.filter((t) => t.cases + t.guaranteed > 0) ?? [];
  return (
    <section className="mb-4 min-w-0 lg:mb-6" aria-label="Статистика за 30 дней">
      <div className="mb-2 flex items-center gap-2 text-[var(--text-muted)]">
        <BarChart3 className="h-4 w-4" />
        <span className="field-label">Статистика за 30 дней</span>
        {q.isError && <span className="text-[12px] text-[var(--danger-ink)]">не загрузилась</span>}
      </div>
      <div className="grid min-w-0 grid-cols-2 gap-2 lg:grid-cols-4 lg:gap-3">
        {tiles.map((t) => (
          <div key={t.label} className="card-2 min-w-0 px-3 py-2.5">
            <div className="text-[11.5px] leading-tight text-[var(--text-faint)]">{t.label}</div>
            <div className={cn("tabular mt-1 break-words font-display text-[18px] font-bold leading-tight text-[var(--ink)]", q.isLoading && "opacity-40")}>
              {t.value}
            </div>
            {t.hint && <div className="mt-0.5 text-[11.5px] text-[var(--text-faint)]">{t.hint}</div>}
          </div>
        ))}
      </div>
      {tiers.length > 0 && (
        <div className="mt-2 flex min-w-0 flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-[var(--text-muted)]">
          {tiers.map((t) => (
            <span key={t.tier} className="tabular">
              <b style={{ color: CASE_TIER_METAL[t.tier].ga }}>{CASE_TIER_LABEL[t.tier]}</b>: кейсов {t.cases}, открыто {t.opened}
              {t.guaranteed > 0 ? `, скидкой ${t.guaranteed}` : ""}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
