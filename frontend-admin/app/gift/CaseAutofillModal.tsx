"use client";

/**
 * «Автособрать»: the server picks prizes for the tier from the catalog (price bands relative to the
 * threshold, popular and in stock, categories mixed) and sets chances so that a case costs the chosen
 * share of the margin on an order at the threshold (POST …/tiers/{tier}/autofill). The result replaces
 * the draft — prizes marked «Закрепить» stay. Nothing is published.
 *
 * The chosen categories are remembered as the defaults (settings gift.caseCategories /
 * gift.caseSuperCategories).
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { CASE_TIER_METAL, type CaseTier } from "@shop/shared";
import { adminApi, ApiError } from "@/lib/api";
import { AUTOFILL_COST_SHARE, CASE_TIER_LABEL, giftApi, type AutofillResult, type GiftTierAdmin } from "@/lib/gift";
import { settingsApi } from "@/lib/settings";
import { cn } from "@/lib/cn";
import { money } from "@/lib/money";
import { useToast } from "@/lib/toast";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Toggle } from "@/components/ui/Toggle";
import { toDraft, type Row } from "./case-draft";

const CATS_KEY = "gift.caseCategories";
const SUPER_KEY = "gift.caseSuperCategories";
const PRIZES = ["6", "8", "10", "12"] as const;
const DISCOUNTS = ["0", "1", "2", "3", "4"] as const;

const splitSlugs = (v: unknown) =>
  String(v ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

export function CaseAutofillModal({
  open,
  onClose,
  tier,
  t,
  rows,
  onResult,
}: {
  open: boolean;
  onClose: () => void;
  tier: CaseTier;
  t: GiftTierAdmin | null;
  rows: Row[];
  onResult: (res: AutofillResult) => void;
}) {
  const { push } = useToast();
  const cats = useQuery({ queryKey: ["categories"], queryFn: adminApi.categories, enabled: open, staleTime: 5 * 60_000 });
  // Its own key: the page's settings query backs a form whose draft must not reset when these change.
  const settings = useQuery({ queryKey: ["gift", "autofill-settings"], queryFn: settingsApi.list, enabled: open, staleTime: 60_000 });
  const roots = useMemo(
    () => (cats.data ?? []).filter((c) => !c.parentId && c.productCount > 0).sort((a, b) => a.sortOrder - b.sortOrder),
    [cats.data]
  );

  const [costShare, setCostShare] = useState(AUTOFILL_COST_SHARE[tier]);
  const [prizes, setPrizes] = useState<(typeof PRIZES)[number]>("8");
  const [discounts, setDiscounts] = useState<(typeof DISCOUNTS)[number]>("2");
  const [chosen, setChosen] = useState<string[] | null>(null);
  const [superChosen, setSuperChosen] = useState<string[] | null>(null);
  const [jackpot, setJackpot] = useState(true);
  const [newOnly, setNewOnly] = useState(true);
  const [keepLocked, setKeepLocked] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setCostShare(AUTOFILL_COST_SHARE[tier]);
    setPrizes(tier === "GOLD" ? "10" : "8");
  }, [tier]);
  useEffect(() => {
    if (!settings.data) return;
    const v = new Map(settings.data.items.map((it) => [it.key, it.value]));
    setChosen((c) => c ?? splitSlugs(v.get(CATS_KEY)));
    setSuperChosen((c) => c ?? splitSlugs(v.get(SUPER_KEY)));
  }, [settings.data]);

  const locked = rows.filter((r) => r.locked);
  const T = (t?.thresholdUah ?? 0) * 100;
  const margin = t?.marginPercent ?? 15;
  const target = Math.round((T * margin * costShare) / 10_000);
  const cat = chosen ?? [];
  const sup = superChosen ?? [];

  async function build() {
    if (cat.length === 0) {
      push("Выберите хотя бы одну категорию призов", "error");
      return;
    }
    setBusy(true);
    try {
      const res = await giftApi.autofill(tier, {
        prizes: Number(prizes),
        costShare,
        discounts: Number(discounts),
        categories: cat,
        superCategories: sup,
        jackpot: tier === "GOLD" && jackpot,
        newOnly,
        locked: keepLocked ? toDraft(locked) : [],
        seed: Math.floor(Math.random() * 2 ** 31),
      });
      onResult(res);
      onClose();
      // Remember the categories as the defaults (best effort).
      const values: Record<string, string> = {};
      const v = new Map((settings.data?.items ?? []).map((it) => [it.key, String(it.value ?? "")]));
      if (cat.join(",") !== v.get(CATS_KEY)) values[CATS_KEY] = cat.join(",");
      if (sup.join(",") !== v.get(SUPER_KEY)) values[SUPER_KEY] = sup.join(",");
      if (Object.keys(values).length) void settingsApi.save(values).then(() => settings.refetch(), () => undefined);
    } catch (e) {
      push(e instanceof ApiError ? e.message : "Не удалось собрать кейс", "error");
    } finally {
      setBusy(false);
    }
  }

  const toggle = (list: string[], slug: string) => (list.includes(slug) ? list.filter((s) => s !== slug) : [...list, slug]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title={
        <span>
          Автособрать · <span style={{ color: CASE_TIER_METAL[tier].ga }}>{CASE_TIER_LABEL[tier].toLowerCase()} кейс</span>
        </span>
      }
      footer={
        <div className="flex w-full flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Отмена
          </Button>
          <Button variant="accent" icon={<Sparkles className="h-4 w-4" />} loading={busy} onClick={() => void build()}>
            Собрать в черновик
          </Button>
        </div>
      }
    >
      <p className="text-[12.5px] leading-snug text-[var(--text-muted)]">
        Подберу призы по цене относительно порога ({money(T)}), популярные и в наличии, разных категорий, и расставлю шансы. Результат —
        черновик: его можно поправить, протестировать и только потом опубликовать.
      </p>

      <div className="mt-4 min-w-0">
        <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3">
          <span className="field-label">Щедрость</span>
          <span className="tabular text-[12.5px] text-[var(--text-muted)]">
            кейс ≈ <b className="text-[var(--ink)]">{money(Math.round(target / 100) * 100)}</b> · {costShare} % маржи
          </span>
        </div>
        <input
          type="range"
          min={10}
          max={120}
          step={5}
          value={costShare}
          aria-label="Щедрость: доля маржи на кейс, %"
          onChange={(e) => setCostShare(Number(e.target.value))}
          className="mt-2 w-full accent-[var(--accent)]"
        />
        <div className="flex justify-between text-[11px] text-[var(--text-faint)]">
          <span>скупо</span>
          <span>щедро</span>
        </div>
        <p className="mt-1 text-[11.5px] leading-snug text-[var(--text-faint)]">
          Маржа с заказа на пороге при средней марже {margin} % — {money(Math.round((T * margin) / 100 / 100) * 100)}. Товар-приз стоит
          магазину цену минус маржу, скидка — всю сумму.
        </p>
      </div>

      <div className="mt-4 grid min-w-0 grid-cols-1 gap-3 min-[420px]:grid-cols-2">
        <div className="min-w-0">
          <div className="field-label mb-1.5">Призов</div>
          <SegmentedControl value={prizes} onChange={setPrizes} options={PRIZES.map((p) => ({ value: p, label: p }))} />
        </div>
        <div className="min-w-0">
          <div className="field-label mb-1.5">Из них скидок</div>
          <SegmentedControl value={discounts} onChange={setDiscounts} options={DISCOUNTS.map((p) => ({ value: p, label: p }))} />
        </div>
      </div>

      <div className="mt-4 min-w-0">
        <div className="field-label mb-1.5">Категории призов</div>
        <Chips roots={roots} loading={cats.isLoading} value={cat} onToggle={(s) => setChosen(toggle(cat, s))} />
      </div>

      {tier === "GOLD" && (
        <div className="mt-4 min-w-0">
          <Toggle checked={jackpot} onChange={setJackpot} label="Джекпот — суперприз" />
          {jackpot && (
            <>
              <p className="mt-1 text-[11.5px] leading-snug text-[var(--text-faint)]">
                Самый дорогой товар в наличии из этих категорий, шанс — до 0,5 %.
              </p>
              <div className="mt-1.5">
                <Chips roots={roots} loading={cats.isLoading} value={sup} onToggle={(s) => setSuperChosen(toggle(sup, s))} />
              </div>
            </>
          )}
        </div>
      )}

      <div className="mt-4 flex min-w-0 flex-col gap-2.5">
        <Toggle checked={newOnly} onChange={setNewOnly} label="Только новые товары (без уценки и б/у)" />
        {locked.length > 0 && (
          <Toggle checked={keepLocked} onChange={setKeepLocked} label={`Оставить закреплённые (${locked.length})`} />
        )}
      </div>
    </Modal>
  );
}

function Chips({
  roots,
  loading,
  value,
  onToggle,
}: {
  roots: { slug: string; name: string; productCount: number }[];
  loading: boolean;
  value: string[];
  onToggle: (slug: string) => void;
}) {
  if (loading) return <p className="text-[12.5px] text-[var(--text-faint)]">Загрузка категорий…</p>;
  return (
    <div className="flex min-w-0 flex-wrap gap-1.5">
      {roots.map((c) => {
        const on = value.includes(c.slug);
        return (
          <button
            key={c.slug}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(c.slug)}
            className={cn(
              "focusable h-8 rounded-full border px-3 text-[12.5px] font-semibold transition-colors pointer-coarse:h-10",
              on
                ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] text-[var(--ink)]"
                : "border-[var(--line)] bg-[var(--surface-2)] text-[var(--text-muted)] hover:text-[var(--text)]"
            )}
          >
            {c.name} <span className="tabular text-[11px] opacity-60">{c.productCount}</span>
          </button>
        );
      })}
    </div>
  );
}
