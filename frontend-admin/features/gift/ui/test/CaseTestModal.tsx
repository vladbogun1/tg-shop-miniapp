"use client";

/**
 * «Тест кейса»: the admin opens a tier's case as many times as they like — with the customer's reel
 * (GiftCaseOpening from @shop/shared/case-ui) or at once («Быстрое открытие»), one by one or ×10 / ×100
 * / ×1000 — and sees how often each prize dropped against its chance.
 *
 * Every draw is POST /api/admin/gift/tiers/{tier}/test-draw: the checkout's own algorithm on the
 * server (GiftService.draw over the active prizes with weight > 0, a product only in stock, SecureRandom),
 * and nothing is saved — no order, promo code, stock reserve or journal entry.
 *
 * The session's numbers live per tier while the page is open; they start over by «Сбросить» or by
 * themselves when the chances change (a prize edited, sold out or switched off) — mixing runs of
 * different chances would make the comparison meaningless.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Dices, Zap } from "lucide-react";
import { CASE_TIER_METAL, sortCasePrizes, type CaseItem, type CaseTier, type GiftCaseOpen } from "@shop/core/giftcase";
import { GiftCaseOpening, type GiftCaseTexts } from "@shop/ui/gift-case";
import { money } from "@/lib/money";
import { useOverlayLayer } from "@shop/ui/overlay";
import { toast } from "@shop/ui/toast";
import { Button } from "@shop/ui/admin-button";
import { Modal } from "@shop/ui/overlay";
import { Toggle } from "@/components/ui/Toggle";
import { formatNumber } from "@shop/core/money";
import { useTestDraw } from "../../queries";
import { CASE_RARITY_LABEL, CASE_TIER_LABEL } from "../../model/labels";
import { addRun, EMPTY_STATS, statLines, toCaseItem, type TestStats } from "../../model/test-stats";
import type { CaseDraftItem, CaseItemAdmin, CaseTestDraw } from "../../model/types";
import { caseImage, LastRun, StatsSection } from "./TestParts";

const BULK = [10, 100, 1000] as const;

const TEXTS: GiftCaseTexts = {
  title: "Тест кейса",
  eyebrow: "Тест · ничего не сохраняется",
  canDrop: "Что может выпасть",
  open: "Открыть кейс",
  opening: "Открываем…",
  rarity: CASE_RARITY_LABEL,
  youGot: "Выпало",
  addedFree: "Тест: в заказ ничего не добавлено",
  take: "Готово",
  close: "Закрыть",
  soundOn: "Включить звук",
  soundOff: "Выключить звук",
  error: "Не удалось открыть кейс",
  retry: "Ещё раз",
  tierName: CASE_TIER_LABEL,
  discountTitle: "Скидка {d}",
  discountNext: "Тест: промокод не выдаётся",
  promo: { label: "Промокод", copy: "Копировать", copied: "Скопировано", validUntil: "До {date}", used: "Использован" },
  swapHint: "",
  swapAction: "",
  swapped: "",
  swapError: "",
};

export function CaseTestModal({
  open,
  onClose,
  tier,
  items,
  draft,
  lowMarginPercent,
}: {
  open: boolean;
  onClose: () => void;
  tier: CaseTier;
  /** The tier's share of product prizes for an order with a low-margin product, % (the «Lamzu» switch). */
  lowMarginPercent?: number;
  /** Prizes of the tier (titles, pictures, rarities of the stats rows); of the draft — new ones with id −(index + 1). */
  items: CaseItemAdmin[];
  /** The case builder's unpublished draft: tested instead of the saved prizes. */
  draft?: CaseDraftItem[] | null;
}) {
  const [fast, setFast] = useState(false);
  // Two points of writing, each with its own double-press guard: the ×N buttons and the reel.
  const runDraw = useTestDraw(tier);
  const reelDraw = useTestDraw(tier);
  const busy = runDraw.isPending ? (runDraw.variables?.count ?? null) : null;
  // As for an order with a low-margin product: product prizes get the tier's share, discounts the rest.
  const [lowMargin, setLowMargin] = useState(false);
  // Numbers per tier and mode («SILVER» / «SILVER:lm»): the modes have different chances.
  const [byTier, setByTier] = useState<Record<string, TestStats>>({});
  const [last, setLast] = useState<{ tier: CaseTier; run: number; drops: CaseItem[]; count: number } | null>(null);
  // The case screen over the modal; a new `reel` key remounts it for «Открыть ещё».
  const [reel, setReel] = useState(0);
  const [reelOpen, setReelOpen] = useState(false);
  const closable = useRef(true);
  // The numbers as of the last run (a run's result is added to them synchronously, before React re-renders).
  const byTierRef = useRef(byTier);
  const statsKey = lowMargin ? `${tier}:lm` : tier;
  const stats = byTier[statsKey] ?? EMPTY_STATS;
  const m = CASE_TIER_METAL[tier];

  // While the case screen is up, Esc is its own (it closes only when closing is allowed) — not the modal's.
  useOverlayLayer(reelOpen, () => {}, { lockScroll: false, passEscape: true });

  const prizes = useMemo(() => sortCasePrizes(items.filter((it) => it.chancePercent > 0).map(toCaseItem)), [items]);
  const byId = useMemo(() => new Map(items.map((it) => [it.id, it])), [items]);

  const record = useCallback(
    (res: CaseTestDraw, key: string) => {
      const r = addRun(byTierRef.current[key] ?? EMPTY_STATS, res);
      byTierRef.current = { ...byTierRef.current, [key]: r.next };
      setByTier(byTierRef.current);
      if (r.restarted) toast.success("Шансы изменились — статистика теста начата заново");
    },
    []
  );

  async function run(count: number) {
    // A failure is already a toast (useApiMutation).
    const res = await runDraw.mutateAsync({ count, draft: draft ?? undefined, lowMargin }).catch(() => null);
    if (!res) return;
    record(res, statsKey);
    setLast((l) => ({ tier: res.tier, run: (l?.run ?? 0) + 1, drops: res.drops, count: res.count }));
  }

  // The reel's draw: one test-draw; the prize goes into the numbers right away (it is drawn even if
  // the admin closes the screen before it stops — they can't, but the count must not depend on it).
  const openCase = useCallback(async (): Promise<GiftCaseOpen> => {
    // A failure is a toast (useApiMutation) and the error goes on to the reel screen.
    const res = await reelDraw.mutateAsync({ count: 1, draft: draft ?? undefined, lowMargin });
    record(res, statsKey);
    setLast((l) => ({ tier: res.tier, run: (l?.run ?? 0) + 1, drops: res.drops, count: 1 }));
    const reelItems = res.reel.some((c) => c.key === res.won.key) ? res.reel : [...res.reel, res.won];
    return { status: "OPENED", tier: res.tier, won: res.won, reel: reelItems, promo: null, swap: null };
  }, [reelDraw, draft, lowMargin, statsKey, record]);

  const openOnce = () => {
    if (fast) void run(1);
    else {
      setReel((n) => n + 1);
      setReelOpen(true);
    }
  };

  // A new tier or a closed modal puts the case screen away.
  useEffect(() => {
    if (!open) setReelOpen(false);
  }, [open]);

  const rows = useMemo(() => statLines(stats, byId), [stats, byId]);

  const shown = last && last.tier === tier ? last : null;
  const maxChance = Math.max(1, ...rows.map((r) => Math.max(r.chance, r.fact)));

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        size="lg"
        title={
          <span className="flex min-w-0 items-center gap-2">
            <img src={`/case/${tier.toLowerCase()}/case-closed-sm.webp`} alt="" className="h-7 w-10 shrink-0 object-contain" draggable={false} />
            <span className="truncate">
              Тест кейса · <span style={{ color: m.ga }}>{CASE_TIER_LABEL[tier].toLowerCase()}</span>
            </span>
          </span>
        }
      >
        <p className="text-[12.5px] leading-snug text-[var(--text-muted)]">
          {draft ? <b className="text-[var(--warn)]">Тестируется черновик — он ещё не опубликован. </b> : null}
          Розыгрыш на сервере тем же алгоритмом, что при заказе: активные призы с шансом больше 0, товар — только в наличии.{" "}
          <b className="text-[var(--text)]">Ничего не сохраняется</b> — ни заказа, ни промокода, ни резерва склада, ни записи в журнале.
        </p>

        {prizes.length === 0 ? (
          <p className="card-2 mt-3 p-3 text-[13px] font-semibold text-[var(--danger-ink)]">
            Ни один приз этого кейса сейчас не может выпасть — тестировать нечего.
          </p>
        ) : (
          <>
            <div className="mt-3 flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
              <Button
                className="min-w-[180px] flex-1 sm:flex-none"
                variant="accent"
                icon={fast ? <Zap className="h-4 w-4" /> : <Dices className="h-4 w-4" />}
                loading={busy === 1}
                disabled={busy !== null}
                onClick={openOnce}
              >
                {stats.n > 0 ? "Открыть ещё" : "Открыть кейс"}
              </Button>
              <Toggle checked={fast} onChange={setFast} label="Быстрое открытие" />
              <Toggle checked={lowMargin} onChange={setLowMargin} label="Заказ с товаром «упор на скидки»" />
            </div>
            {lowMargin && (
              <p className="mt-1.5 text-[12px] leading-snug text-[var(--text-muted)]">
                Как для заказа с товаром из списка «Упор на скидки»: все товарные призы вместе —{" "}
                <b className="tabular text-[var(--text)]">{lowMarginPercent ?? 10} %</b>, остальное — призы-скидки
                (если они есть в кейсе). Настраивается в «Настройках» уровня.
              </p>
            )}
            <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2">
              <span className="text-[12px] text-[var(--text-faint)]">Сразу много:</span>
              {BULK.map((n) => (
                <Button key={n} size="sm" variant="surface" className="tabular" loading={busy === n} disabled={busy !== null} onClick={() => void run(n)}>
                  ×{formatNumber(n, "ru-RU")}
                </Button>
              ))}
            </div>

            <LastRun shown={shown} />
          </>
        )}

        <StatsSection
          stats={stats}
          rows={rows}
          max={maxChance}
          disabled={busy !== null}
          onReset={() => {
            byTierRef.current = { ...byTierRef.current, [statsKey]: EMPTY_STATS };
            setByTier(byTierRef.current);
          }}
        />
      </Modal>

      <GiftCaseOpening
        key={reel}
        open={open && reelOpen}
        onClose={() => {
          if (closable.current) setReelOpen(false);
        }}
        openCase={openCase}
        prizes={prizes}
        tier={tier}
        texts={TEXTS}
        money={money}
        resolveImage={caseImage}
        onClosableChange={(c) => {
          // Block body: the screen calls this inside an effect, a returned value would be taken for its cleanup.
          closable.current = c;
        }}
        onAgain={() => setReel((n) => n + 1)}
        againLabel="Открыть ещё"
      />
    </>
  );
}
