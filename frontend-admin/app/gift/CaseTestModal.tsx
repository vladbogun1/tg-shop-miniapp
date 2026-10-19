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
import { AnimatePresence, motion } from "framer-motion";
import { Dices, RotateCcw, Zap } from "lucide-react";
import {
  CASE_RARITY_COLOR,
  CASE_TIER_METAL,
  caseDiscountText,
  sortCasePrizes,
  type CaseItem,
  type CaseTier,
  type GiftCaseOpen,
} from "@shop/shared";
import { GiftCaseOpening, type GiftCaseTexts } from "@shop/shared/case-ui";
import { ApiError } from "@/lib/api";
import { CASE_RARITY_LABEL, CASE_TIER_LABEL, giftApi, type CaseDraftItem, type CaseItemAdmin, type CaseTestDraw } from "@/lib/gift";
import { cn } from "@/lib/cn";
import { resolveImageSrc } from "@/lib/image";
import { money } from "@/lib/money";
import { useOverlayLayer } from "@/lib/overlay-stack";
import { useToast } from "@/lib/toast";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Toggle } from "@/components/ui/Toggle";

const BULK = [10, 100, 1000] as const;

/** The session's numbers of one tier. */
interface TestStats {
  /** Draws so far. */
  n: number;
  /** gift_case_items.id → drops. */
  hits: Record<number, number>;
  /** gift_case_items.id → real chance, % (the latest run's). */
  chances: Record<number, number>;
  /** The chances the numbers were counted with («id:chance,…»): a different one starts over. */
  sig: string;
}

const EMPTY: TestStats = { n: 0, hits: {}, chances: {}, sig: "" };

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

const caseImage = (src: string, size: number) => resolveImageSrc(src, size);

/** «24,58» / «0,001»: up to 4 decimals, Russian separator. */
function pct(p: number, digits = 4): string {
  return p.toLocaleString("ru-RU", { maximumFractionDigits: digits });
}

function prizeKey(it: CaseItemAdmin): string {
  return it.kind === "DISCOUNT" ? `d${it.id}` : `p${it.productId}`;
}

/** An admin prize as the case screen sees it. */
function toCaseItem(it: CaseItemAdmin): CaseItem {
  return {
    key: prizeKey(it),
    kind: it.kind,
    productId: it.productId,
    title: it.kind === "DISCOUNT" ? null : it.title,
    imageUrl: it.imageUrl,
    priceMinor: it.priceMinor,
    rarity: it.rarity,
    discountPercent: it.discountPercent,
    discountAmountMinor: it.discountPercent > 0 ? 0 : it.discountUah * 100,
  };
}

function itemTitle(it: CaseItem): string {
  return it.kind === "DISCOUNT" ? `Скидка ${caseDiscountText(it, money)}` : it.title ?? "Товар";
}

/** The run's numbers added to the session (or a fresh session when the chances changed). */
function addRun(prev: TestStats, res: CaseTestDraw): { next: TestStats; restarted: boolean } {
  const sig = res.hits.map((h) => `${h.id}:${h.chancePercent}`).join(",");
  const restarted = prev.n > 0 && prev.sig !== sig;
  const base = restarted ? EMPTY : prev;
  const hits = { ...base.hits };
  const chances: Record<number, number> = {};
  for (const h of res.hits) {
    hits[h.id] = (hits[h.id] ?? 0) + h.hits;
    chances[h.id] = h.chancePercent;
  }
  return { next: { n: base.n + res.count, hits, chances, sig }, restarted };
}

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
  const { push } = useToast();
  const [fast, setFast] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);
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
  const stats = byTier[statsKey] ?? EMPTY;
  const m = CASE_TIER_METAL[tier];

  // While the case screen is up, Esc is its own (it closes only when closing is allowed) — not the modal's.
  useOverlayLayer(reelOpen, () => {}, { lockScroll: false, passEscape: true });

  const prizes = useMemo(() => sortCasePrizes(items.filter((it) => it.chancePercent > 0).map(toCaseItem)), [items]);
  const byId = useMemo(() => new Map(items.map((it) => [it.id, it])), [items]);

  const record = useCallback(
    (res: CaseTestDraw, key: string) => {
      const r = addRun(byTierRef.current[key] ?? EMPTY, res);
      byTierRef.current = { ...byTierRef.current, [key]: r.next };
      setByTier(byTierRef.current);
      if (r.restarted) push("Шансы изменились — статистика теста начата заново", "ok");
    },
    [push]
  );

  const fail = useCallback((e: unknown) => push(e instanceof ApiError ? e.message : "Не удалось открыть кейс", "error"), [push]);

  async function run(count: number) {
    setBusy(count);
    try {
      const res = await giftApi.testDraw(tier, count, draft ?? undefined, lowMargin);
      record(res, statsKey);
      setLast((l) => ({ tier: res.tier, run: (l?.run ?? 0) + 1, drops: res.drops, count: res.count }));
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  }

  // The reel's draw: one test-draw; the prize goes into the numbers right away (it is drawn even if
  // the admin closes the screen before it stops — they can't, but the count must not depend on it).
  const openCase = useCallback(async (): Promise<GiftCaseOpen> => {
    try {
      const res = await giftApi.testDraw(tier, 1, draft ?? undefined, lowMargin);
      record(res, statsKey);
      setLast((l) => ({ tier: res.tier, run: (l?.run ?? 0) + 1, drops: res.drops, count: 1 }));
      const reelItems = res.reel.some((c) => c.key === res.won.key) ? res.reel : [...res.reel, res.won];
      return { status: "OPENED", tier: res.tier, won: res.won, reel: reelItems, promo: null, swap: null };
    } catch (e) {
      fail(e);
      throw e;
    }
  }, [tier, draft, lowMargin, statsKey, record, fail]);

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

  const rows = useMemo(() => {
    const ids = Object.keys(stats.chances).map(Number);
    return ids
      .map((id) => {
        const it = byId.get(id);
        const hits = stats.hits[id] ?? 0;
        const chance = stats.chances[id] ?? 0;
        const fact = stats.n > 0 ? (hits / stats.n) * 100 : 0;
        // A deviation past ~3σ of a binomial run is worth a look (only once there are enough draws).
        const p = chance / 100;
        const sigma = stats.n > 0 ? Math.sqrt((p * (1 - p)) / stats.n) * 100 : 0;
        const odd = stats.n >= 100 && sigma > 0 && Math.abs(fact - chance) > 3 * sigma;
        return { id, it, hits, chance, fact, odd };
      })
      .sort((a, b) => b.chance - a.chance || a.id - b.id);
  }, [stats, byId]);

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
                  ×{n.toLocaleString("ru-RU")}
                </Button>
              ))}
            </div>

            <AnimatePresence mode="popLayout" initial={false}>
              {shown && (
                <motion.div
                  key={shown.run}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="mt-3 min-w-0"
                >
                  <div className="mb-1.5 text-[12px] text-[var(--text-faint)]">
                    {shown.count === 1
                      ? "Выпало:"
                      : `Последний прогон ×${shown.count.toLocaleString("ru-RU")}${shown.count > shown.drops.length ? `, первые ${shown.drops.length}` : ""}:`}
                  </div>
                  {shown.count === 1 && shown.drops[0] ? (
                    <DropCard item={shown.drops[0]} />
                  ) : (
                    <div className="grid min-w-0 grid-cols-[repeat(auto-fill,minmax(56px,1fr))] gap-1.5">
                      {shown.drops.map((d, i) => (
                        <DropTile key={i} item={d} />
                      ))}
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}

        <div className="mt-4 flex min-w-0 items-center justify-between gap-2">
          <div className="min-w-0 font-display text-[14px] font-bold text-[var(--ink)]">
            Статистика теста · <span className="tabular">{stats.n.toLocaleString("ru-RU")}</span> откр.
          </div>
          <Button
            size="sm"
            variant="ghost"
            icon={<RotateCcw className="h-3.5 w-3.5" />}
            disabled={stats.n === 0 || busy !== null}
            onClick={() => {
              byTierRef.current = { ...byTierRef.current, [statsKey]: EMPTY };
              setByTier(byTierRef.current);
            }}
          >
            Сбросить
          </Button>
        </div>
        {stats.n === 0 ? (
          <p className="mt-1 text-[12.5px] leading-snug text-[var(--text-muted)]">
            Откройте кейс — здесь появится, сколько раз выпал каждый приз и его доля против настроенного шанса.
          </p>
        ) : (
          <>
            <ul className="mt-2 flex min-w-0 flex-col gap-1.5">
              {rows.map((r) => (
                <StatRow key={r.id} row={r} max={maxChance} />
              ))}
            </ul>
            <p className="mt-2 text-[11.5px] leading-snug text-[var(--text-faint)]">
              «Шанс» — фактический шанс приза среди тех, что могут выпасть (вес / сумма весов). Полоса — доля в тесте, риска — шанс.
              Жёлтым — отклонение больше 3σ (при 100+ открытиях; иногда бывает и случайно).
            </p>
          </>
        )}
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

function PrizeThumb({ item, size }: { item: CaseItem; size: number }) {
  if (item.kind === "DISCOUNT") {
    return (
      <span
        className="grid shrink-0 place-items-center rounded-[var(--r-sm)] bg-[var(--surface-2)] font-display text-[11px] font-bold leading-none"
        style={{ width: size, height: size, color: CASE_RARITY_COLOR[item.rarity] }}
        aria-hidden
      >
        {caseDiscountText(item, money)}
      </span>
    );
  }
  return item.imageUrl ? (
    <img
      src={caseImage(item.imageUrl, size * 2)}
      alt=""
      className="shrink-0 rounded-[var(--r-sm)] bg-[var(--surface-2)] object-contain"
      style={{ width: size, height: size }}
      draggable={false}
    />
  ) : (
    <span className="grid shrink-0 place-items-center rounded-[var(--r-sm)] bg-[var(--surface-2)]" style={{ width: size, height: size }} aria-hidden>
      🎁
    </span>
  );
}

/** The prize of a single fast opening. */
function DropCard({ item }: { item: CaseItem }) {
  const c = CASE_RARITY_COLOR[item.rarity];
  return (
    <motion.div
      initial={{ scale: 0.92 }}
      animate={{ scale: 1 }}
      transition={{ type: "spring", stiffness: 380, damping: 20 }}
      className="card-2 flex min-w-0 items-center gap-3 p-2.5"
      style={{ borderColor: c, boxShadow: `0 0 18px color-mix(in srgb, ${c} 30%, transparent)` }}
    >
      <PrizeThumb item={item} size={56} />
      <div className="min-w-0">
        <div className="text-[11px] font-bold uppercase tracking-wide" style={{ color: c }}>
          {CASE_RARITY_LABEL[item.rarity]}
        </div>
        <div className="line-clamp-2 text-[13.5px] font-semibold leading-snug text-[var(--ink)]">{itemTitle(item)}</div>
        {item.kind === "PRODUCT" && item.priceMinor > 0 && <div className="tabular text-[12px] text-[var(--text-muted)]">{money(item.priceMinor)}</div>}
      </div>
    </motion.div>
  );
}

/** A draw of a ×N run. */
function DropTile({ item }: { item: CaseItem }) {
  return (
    <div
      className="min-w-0 overflow-hidden rounded-[var(--r-sm)] border-b-[3px] bg-[var(--surface-2)] p-1"
      style={{ borderBottomColor: CASE_RARITY_COLOR[item.rarity] }}
      title={`${itemTitle(item)} · ${CASE_RARITY_LABEL[item.rarity]}`}
    >
      <div className="grid place-items-center">
        <PrizeThumb item={item} size={44} />
      </div>
    </div>
  );
}

function StatRow({
  row,
  max,
}: {
  row: { id: number; it: CaseItemAdmin | undefined; hits: number; chance: number; fact: number; odd: boolean };
  max: number;
}) {
  const item = row.it ? toCaseItem(row.it) : null;
  const rarity = row.it?.rarity ?? "COMMON";
  const c = CASE_RARITY_COLOR[rarity];
  return (
    <li className="card-2 min-w-0 px-2.5 py-2">
      <div className="flex min-w-0 items-center gap-2.5">
        {item ? <PrizeThumb item={item} size={34} /> : <span className="h-[34px] w-[34px] shrink-0" />}
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold leading-tight text-[var(--ink)]">{item ? itemTitle(item) : `Приз #${row.id}`}</div>
          <div className="text-[11px] font-semibold leading-tight" style={{ color: c }}>
            {CASE_RARITY_LABEL[rarity]}
          </div>
        </div>
        <div className="shrink-0 text-right leading-tight">
          <div className={cn("tabular text-[13px] font-bold", row.odd ? "text-[var(--warn)]" : "text-[var(--ink)]")}>{pct(row.fact, 2)} %</div>
          <div className="tabular text-[11px] text-[var(--text-faint)]">
            {row.hits.toLocaleString("ru-RU")} · шанс {pct(row.chance)} %
          </div>
        </div>
      </div>
      <div className="relative mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--surface-hover)]" aria-hidden>
        <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${(row.fact / max) * 100}%`, background: c }} />
        <div className="absolute inset-y-[-2px] w-[2px] bg-[var(--ink)]" style={{ left: `calc(${Math.min(100, (row.chance / max) * 100)}% - 1px)` }} />
      </div>
    </li>
  );
}
