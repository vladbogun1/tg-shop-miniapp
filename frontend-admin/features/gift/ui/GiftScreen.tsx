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
import Link from "next/link";
import { FileSpreadsheet } from "lucide-react";
import { useForm } from "@shop/ui/form";
import { initialDraft, isDirty, parse, validate, type Draft, type SettingValue } from "@/features/settings";
import { useUnsavedGuard } from "@/lib/use-unsaved-guard";
import { PageHeader } from "@/components/layout/PageHeader";
import { QueryState } from "@/components/ui/QueryState";
import { GIFT_GROUP } from "../model/labels";
import { GIFT_SETTING } from "../model/settings-keys";
import { useGiftSettingsQuery, useSaveGiftSettings } from "../queries";
import { CasePanel } from "./case/CasePanel";
import { GiftSaveBar } from "./GiftSaveBar";
import { GiftSection } from "./GiftSection";
import { GiftSummaryBar } from "./GiftSummaryBar";
import { LowMarginPanel } from "./LowMarginPanel";
import { StatsStrip } from "./StatsStrip";
import { useGiftProblem } from "./use-gift-problem";

const EMPTY_DRAFT: Draft = {};

export function GiftScreen() {
  const q = useGiftSettingsQuery();
  const save = useSaveGiftSettings();
  const items = useMemo(() => (q.data?.items ?? []).filter((it) => it.group === GIFT_GROUP), [q.data]);
  const byKey = useMemo(() => new Map(items.map((it) => [it.key, it])), [items]);

  // The edits live in the form (field `entries`); refilled when the server's copy changes.
  const form = useForm<{ entries: Draft }>({ defaultValues: { entries: {} } });
  const draft = form.watch("entries") ?? EMPTY_DRAFT;
  const { reset: resetForm } = form;
  useEffect(() => {
    if (q.data)
      resetForm({
        entries: initialDraft(q.data.items.filter((it) => it.group === GIFT_GROUP)),
      });
  }, [q.data, resetForm]);

  const dirtyItems = useMemo(() => items.filter((it) => isDirty(it, draft[it.key])), [items, draft]);
  const invalid = dirtyItems.some((it) => validate(it, draft[it.key].raw));
  const dirty = dirtyItems.length > 0;
  useUnsavedGuard(dirty);

  const change = (key: string, raw: string | boolean) =>
    form.setValue("entries", {
      ...form.getValues("entries"),
      [key]: { raw, reset: false },
    });
  const discard = () => resetForm({ entries: initialDraft(items) });

  function submit() {
    if (!dirty || invalid) return;
    const values: Record<string, SettingValue | null> = {};
    for (const it of dirtyItems) values[it.key] = parse(it, draft[it.key].raw);
    save.mutate(values);
  }

  const isCase = Boolean(draft[GIFT_SETTING.giftCase]?.raw);
  const savedReminder = byKey.get(GIFT_SETTING.promoReminder)?.value;
  const reminderDays = typeof savedReminder === "number" ? savedReminder : null;

  const field = (key: string) => {
    const item = byKey.get(key);
    const entry = draft[key];
    return item && entry ? { item, entry } : null;
  };
  const productItem = byKey.get(GIFT_SETTING.giftProduct);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const productId = String(draft[GIFT_SETTING.giftProduct]?.raw ?? "");
  const giftOn = Boolean(draft[GIFT_SETTING.giftEnabled]?.raw);
  const problem = useGiftProblem(productId, giftOn, isCase);

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
          <p className="panel p-4 text-[13px] text-[var(--text-muted)]">Сервер не отдал настройки подарка — обновите бэкенд.</p>
        ) : (
          <>
            <GiftSummaryBar
              on={giftOn}
              isCase={isCase}
              threshold={draft[GIFT_SETTING.giftThreshold]?.raw}
              monthlyLimit={draft[GIFT_SETTING.monthlyLimit]?.raw}
              problem={problem}
              dirtyCount={dirtyItems.length}
              open={settingsOpen}
              onToggle={() => setSettingsOpen((v) => !v)}
            />
            {settingsOpen && (
              <div className="min-w-0 max-w-3xl">
                <GiftSection
                  enabled={field(GIFT_SETTING.giftEnabled)}
                  threshold={field(GIFT_SETTING.giftThreshold)}
                  caseMode={field(GIFT_SETTING.giftCase)}
                  productId={productId}
                  productDirty={!!productItem && isDirty(productItem, draft[GIFT_SETTING.giftProduct])}
                  reminder={field(GIFT_SETTING.promoReminder)}
                  margin={field(GIFT_SETTING.margin)}
                  monthlyLimit={field(GIFT_SETTING.monthlyLimit)}
                  onChange={change}
                />
              </div>
            )}
          </>
        )}
        {isCase && (
          <section className="panel mt-4 min-w-0 p-4 sm:p-5">
            <CasePanel reminderDays={reminderDays} />
          </section>
        )}
        {isCase && <LowMarginPanel />}
      </QueryState>

      <GiftSaveBar count={dirtyItems.length} invalid={invalid} saving={save.isPending} onDiscard={discard} onSave={submit} />
    </div>
  );
}
