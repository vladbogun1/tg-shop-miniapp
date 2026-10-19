"use client";

/**
 * «Кейсы» (gift cases, V57): three tiers — bronze, silver, gold — each with its own threshold of the
 * order sum, its own prizes (products or discounts on the next order), the guaranteed discount the
 * customer may take at checkout instead of the case, and the swap of a product prize similar to what
 * they bought for a discount code. The order gets the dearest tier its sum reaches.
 *
 * The server draws the prize (at checkout, or when an admin gives a case) among the tier's active
 * prizes that can drop (a product in stock; a discount always). The admin sets each prize's chance in %
 * (stored as `weight` in millionths: 10 000 = 1 %); the server re-normalises the chances over the
 * prizes that can drop, and that real chance (`chancePercent`) is shown next to the input. Customers
 * never see the chances. Each change goes to the server at once (like «Пары категорий»).
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Dices, Package, Percent, Trash2 } from "lucide-react";
import { CASE_RARITY_COLOR, CASE_RARITY_ORDER, CASE_TIER_METAL, CASE_TIER_ORDER, type CaseRarity, type CaseTier } from "@shop/shared";
import type { AdminProduct } from "@/lib/api";
import { ApiError } from "@/lib/api";
import {
  CASE_RARITY_LABEL,
  CASE_TIER_LABEL,
  giftApi,
  type CaseItemAdmin,
  type CaseItemPatch,
  type GiftTierAdmin,
  type GiftTierPatch,
} from "@/lib/gift";
import { cn } from "@/lib/cn";
import { Image } from "@/lib/image";
import { money } from "@/lib/money";
import { useToast } from "@/lib/toast";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useConfirm } from "@/components/ui/ConfirmModal";
import { QueryState } from "@/components/ui/QueryState";
import { Select } from "@/components/ui/Select";
import { Toggle } from "@/components/ui/Toggle";
import { ProductPickModal } from "@/components/ProductPickModal";
import { CaseTestModal } from "./CaseTestModal";

export const CASE_ITEMS_KEY = ["gift", "case-items"] as const;
export const CASE_TIERS_KEY = ["gift", "tiers"] as const;

/** `weight` units per 1 % (the server's GiftService.CASE_WEIGHT_PER_PERCENT). */
const WEIGHT_PER_PERCENT = 10_000;

/** Default chance (%) of a new prize by rarity. */
const DEFAULT_CHANCE: Record<CaseRarity, number> = { COMMON: 20, RARE: 8, EPIC: 3, LEGENDARY: 0.5, GOLD: 0.001 };

const weightToPercent = (w: number) => w / WEIGHT_PER_PERCENT;
const percentToWeight = (p: number) => Math.round(p * WEIGHT_PER_PERCENT);

/** «24,58», «0,001»: up to 4 decimals, Russian separator. */
function fmtPercent(p: number): string {
  return p.toLocaleString("ru-RU", { maximumFractionDigits: 4 });
}

/** «0,001» / «0.001» → 0.001; null when it is not a number in 0…100 with at most 4 decimals. */
function parsePercent(raw: string): number | null {
  const v = raw.trim().replace(",", ".");
  if (!/^\d{1,3}(\.\d{0,4})?$/.test(v)) return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
}

/** Default rarity of a new prize by its retail price (₴): just a starting point, editable. */
function rarityByPrice(priceMinor: number): CaseRarity {
  const uah = priceMinor / 100;
  if (uah < 300) return "COMMON";
  if (uah < 700) return "RARE";
  if (uah < 1200) return "EPIC";
  if (uah < 2000) return "LEGENDARY";
  return "GOLD";
}

const RARITY_OPTIONS = CASE_RARITY_ORDER.map((r) => ({ value: r, label: CASE_RARITY_LABEL[r] }));

const byOrder = (a: CaseItemAdmin, b: CaseItemAdmin) => a.sortOrder - b.sortOrder || a.id - b.id;

const tierArt = (t: CaseTier) => `/case/${t.toLowerCase()}/case-closed-sm.webp`;

export function CasePanel() {
  const qc = useQueryClient();
  const { push } = useToast();
  const [confirm, confirmUi] = useConfirm();
  const tiersQ = useQuery({ queryKey: CASE_TIERS_KEY, queryFn: giftApi.tiers });
  const itemsQ = useQuery({ queryKey: CASE_ITEMS_KEY, queryFn: giftApi.caseItems });
  const [tier, setTier] = useState<CaseTier>("BRONZE");
  const tiers = useMemo(
    () => [...(tiersQ.data ?? [])].sort((a, b) => CASE_TIER_ORDER.indexOf(a.tier) - CASE_TIER_ORDER.indexOf(b.tier)),
    [tiersQ.data]
  );
  const current = tiers.find((t) => t.tier === tier) ?? null;
  const items = useMemo(() => (itemsQ.data ?? []).filter((it) => it.tier === tier).sort(byOrder), [itemsQ.data, tier]);
  const [busy, setBusy] = useState<number | "add" | "tier" | null>(null);
  const [picking, setPicking] = useState(false);
  const [testing, setTesting] = useState(false);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: CASE_ITEMS_KEY });
    qc.invalidateQueries({ queryKey: CASE_TIERS_KEY });
    qc.invalidateQueries({ queryKey: ["gift", "stats"] });
  };
  const fail = (e: unknown, fallback: string) => push(e instanceof ApiError ? e.message : fallback, "error");

  async function patchTier(body: GiftTierPatch, okText: string) {
    setBusy("tier");
    try {
      const fresh = await giftApi.patchTier(tier, body);
      qc.setQueryData<GiftTierAdmin[]>(CASE_TIERS_KEY, (old) => (old ?? []).map((t) => (t.tier === fresh.tier ? fresh : t)));
      push(okText, "ok");
    } catch (e) {
      fail(e, "Не удалось сохранить кейс");
      refresh();
    } finally {
      setBusy(null);
    }
  }

  async function patch(it: CaseItemAdmin, body: CaseItemPatch, okText: string) {
    setBusy(it.id);
    try {
      await giftApi.patchCaseItem(it.id, body);
      push(okText, "ok");
      refresh();
    } catch (e) {
      fail(e, "Не удалось сохранить приз");
      refresh();
    } finally {
      setBusy(null);
    }
  }

  /** Swap with the neighbour; equal sort orders → renumber the tier's list by 10. */
  async function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const a = items[i];
    const b = items[j];
    setBusy(a.id);
    try {
      if (a.sortOrder !== b.sortOrder) {
        await giftApi.patchCaseItem(a.id, { sortOrder: b.sortOrder });
        await giftApi.patchCaseItem(b.id, { sortOrder: a.sortOrder });
      } else {
        const next = [...items];
        [next[i], next[j]] = [next[j], next[i]];
        for (let k = 0; k < next.length; k++) {
          const want = (k + 1) * 10;
          if (next[k].sortOrder !== want) await giftApi.patchCaseItem(next[k].id, { sortOrder: want });
        }
      }
      refresh();
    } catch (e) {
      fail(e, "Не удалось переставить");
      refresh();
    } finally {
      setBusy(null);
    }
  }

  async function remove(it: CaseItemAdmin) {
    const ok = await confirm({
      title: "Убрать приз из кейса?",
      message: <>«{it.title}» больше не будет выпадать из кейса «{CASE_TIER_LABEL[it.tier]}». Уже выданные призы в заказах не изменятся.</>,
      confirmLabel: "Убрать",
      danger: true,
    });
    if (!ok) return;
    setBusy(it.id);
    try {
      await giftApi.deleteCaseItem(it.id);
      push("Приз убран", "ok");
      refresh();
    } catch (e) {
      fail(e, "Не удалось удалить");
    } finally {
      setBusy(null);
    }
  }

  async function addProduct(p: AdminProduct) {
    if (items.some((it) => it.productId === p.id)) {
      push("Этот товар уже есть в этом кейсе", "error");
      return;
    }
    const rarity = rarityByPrice(p.priceMinor);
    setBusy("add");
    try {
      await giftApi.createCaseItem({ tier, kind: "PRODUCT", productId: p.id, rarity, weight: percentToWeight(DEFAULT_CHANCE[rarity]), active: true });
      push(`Приз добавлен: ${CASE_RARITY_LABEL[rarity].toLowerCase()}, шанс ${fmtPercent(DEFAULT_CHANCE[rarity])} %`, "ok");
      refresh();
    } catch (e) {
      fail(e, "Не удалось добавить приз");
    } finally {
      setBusy(null);
    }
  }

  async function addDiscount() {
    // A starting point by tier — the admin edits the value right in the row.
    const pct = tier === "GOLD" ? 15 : tier === "SILVER" ? 10 : 5;
    setBusy("add");
    try {
      await giftApi.createCaseItem({ tier, kind: "DISCOUNT", discountPercent: pct, rarity: "RARE", weight: percentToWeight(DEFAULT_CHANCE.RARE), active: true });
      push(`Добавлена скидка ${pct} % — поменяйте размер и шанс в строке`, "ok");
      refresh();
    } catch (e) {
      fail(e, "Не удалось добавить скидку");
    } finally {
      setBusy(null);
    }
  }

  const live = items.filter((it) => it.chancePercent > 0);
  /** Sum of the set chances of the prizes that can drop now — the server scales them to 100 %. */
  const setSum = live.reduce((s, it) => s + it.weight, 0) / WEIGHT_PER_PERCENT;
  const avgMinor = current?.avgPrizeMinor ?? 0;
  const share = current && current.thresholdUah > 0 ? (avgMinor / 100 / current.thresholdUah) * 100 : null;
  const anyEnabled = tiers.some((t) => t.enabled && t.livePrizes > 0);

  return (
    <div className="min-w-0">
      <div className="mb-3 min-w-0">
        <div className="font-display text-[15px] font-bold text-[var(--ink)]">Кейсы</div>
        <p className="text-[12.5px] leading-snug text-[var(--text-muted)]">
          Заказ получает самый дорогой кейс, до порога которого дотянул (сумма после скидок). Если в нём нечего разыграть — кейс
          дешевле. Шансы покупатели не видят.
        </p>
      </div>

      <QueryState isLoading={tiersQ.isLoading} isError={tiersQ.isError} error={tiersQ.error} refetch={tiersQ.refetch} loadingLabel="Загрузка кейсов">
        <div role="tablist" aria-label="Кейс" className="grid min-w-0 grid-cols-3 gap-2">
          {CASE_TIER_ORDER.map((t) => {
            const d = tiers.find((x) => x.tier === t);
            const on = t === tier;
            const m = CASE_TIER_METAL[t];
            return (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setTier(t)}
                className={cn(
                  "focusable card-2 relative flex min-w-0 flex-col items-center gap-1 px-1.5 pb-2 pt-1.5 text-center transition-[border-color,background] duration-200",
                  on ? "!border-[var(--tier)] bg-[color-mix(in_srgb,var(--tier)_10%,var(--surface-2))]" : "hover:bg-[var(--surface-hover)]",
                  d && !d.enabled && "opacity-60"
                )}
                style={{ ["--tier" as string]: m.ga }}
              >
                <img src={tierArt(t)} alt="" className="h-10 w-[60px] object-contain sm:h-12 sm:w-[72px]" draggable={false} />
                <span className="font-display text-[12.5px] font-bold leading-tight text-[var(--ink)] sm:text-[13.5px]" style={on ? { color: m.ga } : undefined}>
                  {CASE_TIER_LABEL[t]}
                </span>
                <span className="tabular text-[11px] leading-tight text-[var(--text-faint)]">
                  {d ? (d.enabled ? `от ${money(d.thresholdUah * 100)}` : "выключен") : "—"}
                </span>
                {d && d.enabled && d.livePrizes === 0 && (
                  <span className="text-[10.5px] font-semibold leading-tight text-[var(--danger-ink)]">нет призов</span>
                )}
              </button>
            );
          })}
        </div>
        {tiers.length > 0 && !anyEnabled && (
          <p className="mt-2 text-[12.5px] font-semibold leading-snug text-[var(--warn)]">
            Ни один кейс сейчас не разыгрывается (выключены или без призов) — в заказ попадёт товар-подарок, если он выбран.
          </p>
        )}

        {current && <TierSettings key={current.tier} t={current} busy={busy === "tier"} onPatch={patchTier} />}
      </QueryState>

      <div className="mt-4 flex min-w-0 items-center justify-between gap-2">
        <div className="font-display text-[14px] font-bold text-[var(--ink)]">Призы · {CASE_TIER_LABEL[tier].toLowerCase()} кейс</div>
        <Badge tone="neutral">{items.length}</Badge>
      </div>
      <p className="mt-0.5 text-[12.5px] leading-snug text-[var(--text-muted)]">
        Товар кладётся в заказ бесплатно, скидка выдаётся личным промокодом на следующий заказ. «Шанс, %» — от 0,0001 до 100; шансы
        приводятся к 100 % по призам, которые могут выпасть, — справа фактический шанс.
      </p>

      <QueryState isLoading={itemsQ.isLoading} isError={itemsQ.isError} error={itemsQ.error} refetch={itemsQ.refetch} loadingLabel="Загрузка призов">
        {items.length === 0 ? (
          <p className="card-2 mt-2 p-3 text-[13px] text-[var(--text-muted)]">
            Призов пока нет — этот кейс не разыгрывается, заказ получит кейс дешевле (или товар-подарок).
          </p>
        ) : (
          <ol className="mt-2 flex min-w-0 flex-col gap-2">
            {items.map((it, i) => (
              <CaseRow
                key={it.id}
                it={it}
                first={i === 0}
                last={i === items.length - 1}
                busy={busy === it.id}
                locked={busy !== null}
                onPatch={(body, okText) => patch(it, body, okText)}
                onMove={(dir) => move(i, dir)}
                onRemove={() => remove(it)}
              />
            ))}
          </ol>
        )}
      </QueryState>

      {live.length > 0 && (
        <div className="card-2 mt-3 px-3 py-2.5 text-[13px] leading-snug">
          <div className="text-[var(--text)]">
            Сумма шансов: <b className="tabular">{fmtPercent(Math.round(setSum * 10000) / 10000)} %</b>
            <span className="text-[var(--text-muted)]">
              {Math.abs(setSum - 100) > 0.00005 && " — сервер приводит её к 100 %, фактические шансы справа"}
            </span>
          </div>
          <div className="mt-0.5 text-[var(--text)]">
            Средняя ценность приза ≈ <b className="tabular">{money(Math.round(avgMinor / 100) * 100)}</b>{" "}
            <span className="text-[var(--text-faint)]">(товары по рознице, скидки в ₴; скидки в % не считаются)</span>
          </div>
          {share != null && current && (
            <div className="mt-0.5 text-[var(--text-muted)]">
              На заказ от порога {money(current.thresholdUah * 100)} это ≈{" "}
              <b className="tabular text-[var(--text)]">{share.toLocaleString("ru-RU", { maximumFractionDigits: 1 })} %</b> от порога.
            </div>
          )}
        </div>
      )}
      {items.length > 0 && live.length === 0 && (
        <p className="mt-3 text-[12.5px] font-semibold leading-snug text-[var(--danger-ink)]">
          Ни один приз этого кейса сейчас не может выпасть (нет в наличии, скрыт или выключен).
        </p>
      )}

      <div className="mt-3 flex min-w-0 flex-wrap gap-2">
        <Button
          className="flex-1 sm:flex-none"
          variant="accent"
          icon={<Package className="h-4 w-4" />}
          loading={busy === "add" && picking}
          disabled={busy !== null}
          onClick={() => setPicking(true)}
        >
          Добавить товар
        </Button>
        <Button
          className="flex-1 sm:flex-none"
          variant="surface"
          icon={<Percent className="h-4 w-4" />}
          loading={busy === "add" && !picking}
          disabled={busy !== null}
          onClick={() => void addDiscount()}
        >
          Добавить скидку
        </Button>
        <Button
          className="flex-1 sm:ml-auto sm:flex-none"
          variant="outline"
          icon={<Dices className="h-4 w-4" />}
          disabled={items.length === 0}
          onClick={() => setTesting(true)}
        >
          Тест кейса
        </Button>
      </div>
      <p className="mt-2 text-[12px] leading-snug text-[var(--text-faint)]">
        Редкость новому товару подставляется по цене, шанс — по редкости (обычный 20 %, редкий 8 %, эпический 3 %, легендарный 0,5 %,
        золотой 0,001 %) — их можно поменять. Скидка добавляется как «редкая» 5/10/15 % — размер (в % или ₴) меняется в строке.
      </p>

      <ProductPickModal
        open={picking}
        title={`Приз · ${CASE_TIER_LABEL[tier].toLowerCase()} кейс`}
        onClose={() => setPicking(false)}
        onPick={(p) => {
          setPicking(false);
          void addProduct(p);
        }}
      />
      <CaseTestModal open={testing} onClose={() => setTesting(false)} tier={tier} items={items} />
      {confirmUi}
    </div>
  );
}

/** A whole-number field committed on blur / Enter; Esc reverts. */
function IntField({
  label,
  unit,
  value,
  min,
  max,
  disabled,
  hint,
  onCommit,
}: {
  label: string;
  unit: string;
  value: number;
  min: number;
  max: number;
  disabled?: boolean;
  hint?: string;
  onCommit: (v: number) => void;
}) {
  const [raw, setRaw] = useState(String(value));
  useEffect(() => setRaw(String(value)), [value]);
  const n = raw.trim() === "" ? NaN : Number(raw);
  const bad = !Number.isInteger(n) || n < min || n > max;
  const commit = () => {
    if (bad) {
      setRaw(String(value));
      return;
    }
    if (n !== value) onCommit(n);
  };
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="field-label">{label}</span>
      <span
        className={cn(
          "flex h-10 min-w-0 items-center rounded-[var(--r-md)] border bg-[var(--surface-2)] pr-2.5 pointer-coarse:h-11",
          bad ? "border-[var(--danger)]" : "border-[var(--line)]"
        )}
      >
        <input
          inputMode="numeric"
          value={raw}
          disabled={disabled}
          aria-invalid={bad || undefined}
          onChange={(e) => setRaw(e.target.value.replace(/\D/g, "").slice(0, 7))}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") setRaw(String(value));
          }}
          className="tabular focusable h-full min-w-0 flex-1 bg-transparent px-2.5 text-[14px] text-[var(--text)] outline-none"
        />
        <span className="shrink-0 font-display text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-faint)]">{unit}</span>
      </span>
      {hint && <span className="text-[11.5px] leading-snug text-[var(--text-faint)]">{hint}</span>}
    </label>
  );
}

function TierSettings({ t, busy, onPatch }: { t: GiftTierAdmin; busy: boolean; onPatch: (body: GiftTierPatch, ok: string) => void }) {
  const exampleTotal = t.thresholdUah * 100;
  const gd = t.guaranteedPercent > 0 ? Math.floor((exampleTotal * t.guaranteedPercent) / 100 / 100) * 100 : 0;
  const guaranteed = t.guaranteedMaxUah > 0 ? Math.min(gd, t.guaranteedMaxUah * 100) : gd;
  return (
    <div className="card-2 mt-3 min-w-0 p-3" style={{ borderColor: `color-mix(in srgb, ${CASE_TIER_METAL[t.tier].ga} 40%, var(--line))` }}>
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <Toggle
          checked={t.enabled}
          disabled={busy}
          onChange={(v) => onPatch({ enabled: v }, v ? `${CASE_TIER_LABEL[t.tier]} кейс включён` : `${CASE_TIER_LABEL[t.tier]} кейс выключен`)}
          label={`${CASE_TIER_LABEL[t.tier]} кейс разыгрывается`}
        />
        <span className="text-[12px] text-[var(--text-faint)]">
          призов: {t.prizes}, могут выпасть: {t.livePrizes}
        </span>
      </div>
      <div className="mt-3 grid min-w-0 grid-cols-1 gap-3 min-[420px]:grid-cols-2">
        <IntField
          label="Порог суммы заказа"
          unit="₴"
          value={t.thresholdUah}
          min={1}
          max={1_000_000}
          disabled={busy}
          onCommit={(v) => onPatch({ thresholdUah: v }, `Порог: ${money(v * 100)}`)}
        />
        <IntField
          label="Замена похожего приза"
          unit="%"
          value={t.swapPercent}
          min={0}
          max={100}
          disabled={busy}
          hint="Промокод на этот % цены приза, если похожий товар уже куплен. 0 — без замены"
          onCommit={(v) => onPatch({ swapPercent: v }, v ? `Замена: ${v} % цены приза` : "Замена выключена")}
        />
        <IntField
          label="Гарантированная скидка вместо кейса"
          unit="%"
          value={t.guaranteedPercent}
          min={0}
          max={50}
          disabled={busy}
          hint="Покупатель при оформлении выбирает: эта скидка сразу или кейс. 0 — выбора нет, всегда кейс"
          onCommit={(v) => onPatch({ guaranteedPercent: v }, v ? `Гарантированная скидка: ${v} %` : "Гарантированная скидка выключена")}
        />
        <IntField
          label="Потолок гарантированной скидки"
          unit="₴"
          value={t.guaranteedMaxUah}
          min={0}
          max={100_000}
          disabled={busy || t.guaranteedPercent === 0}
          hint="0 — без потолка"
          onCommit={(v) => onPatch({ guaranteedMaxUah: v }, v ? `Потолок: ${money(v * 100)}` : "Потолок снят")}
        />
      </div>
      {t.guaranteedPercent > 0 && (
        <p className="mt-2 text-[12px] leading-snug text-[var(--text-muted)]">
          Пример: заказ на {money(exampleTotal)} — скидка <b className="tabular text-[var(--text)]">−{money(guaranteed)}</b>
          {t.guaranteedMaxUah > 0 ? ` (не больше ${money(t.guaranteedMaxUah * 100)})` : ""}.
        </p>
      )}
    </div>
  );
}

function CaseRow({
  it,
  first,
  last,
  busy,
  locked,
  onPatch,
  onMove,
  onRemove,
}: {
  it: CaseItemAdmin;
  first: boolean;
  last: boolean;
  busy: boolean;
  locked: boolean;
  onPatch: (body: CaseItemPatch, okText: string) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
}) {
  const setPercent = weightToPercent(it.weight);
  const [chance, setChance] = useState(fmtPercent(setPercent));
  useEffect(() => setChance(fmtPercent(weightToPercent(it.weight))), [it.weight]);
  const parsed = parsePercent(chance);
  const chanceError = parsed === null;
  const color = CASE_RARITY_COLOR[it.rarity];
  const isDiscount = it.kind === "DISCOUNT";
  const cantDrop = !isDiscount && (it.stock <= 0 || !it.productActive);
  // Real chance differs from the set one: the server re-normalised over the prizes that can drop.
  const differs = it.chancePercent > 0 && Math.abs(it.chancePercent - setPercent) >= 0.00005;

  function commitChance() {
    if (parsed === null) {
      setChance(fmtPercent(setPercent));
      return;
    }
    const w = percentToWeight(parsed);
    if (w !== it.weight) onPatch({ weight: w }, `Шанс: ${fmtPercent(parsed)} %`);
    else setChance(fmtPercent(setPercent));
  }

  return (
    <li
      className={cn("card-2 min-w-0 border-l-[3px] p-2.5 transition-opacity", !it.active && "opacity-60", busy && "opacity-50")}
      style={{ borderLeftColor: color }}
    >
      <div className="flex min-w-0 items-start gap-3">
        {isDiscount ? (
          <span
            aria-hidden
            className="grid h-12 w-12 shrink-0 place-items-center rounded-[var(--r-sm)] font-display text-[13px] font-extrabold text-white"
            style={{ background: `linear-gradient(135deg, color-mix(in srgb, ${color} 85%, #fff), color-mix(in srgb, ${color} 70%, #000))` }}
          >
            {it.discountPercent > 0 ? `−${it.discountPercent}%` : "−₴"}
          </span>
        ) : (
          <Image
            src={it.imageUrl ?? undefined}
            alt={it.title}
            size={96}
            className="h-12 w-12 shrink-0 rounded-[var(--r-sm)] border border-[var(--line)] bg-[var(--surface-3)]"
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="break-words text-[13.5px] font-semibold leading-snug text-[var(--text)]">{it.title}</div>
          <div className="tabular mt-0.5 text-[12px] text-[var(--text-faint)]">
            {isDiscount ? (
              "промокод на следующий заказ"
            ) : (
              <>
                {money(it.priceMinor)} ·{" "}
                <span className={cantDrop ? "font-semibold text-[var(--danger-ink)]" : undefined}>
                  {!it.productActive ? "товар скрыт" : it.stock <= 0 ? "нет в наличии" : `${it.stock} шт`}
                </span>
                {cantDrop && it.active && <span className="text-[var(--danger-ink)]"> — не выпадет</span>}
              </>
            )}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className={cn("tabular font-display text-[16px] font-bold leading-tight", it.chancePercent > 0 ? "text-[var(--ink)]" : "text-[var(--text-faint)]")}>
            {fmtPercent(it.chancePercent)} %
          </div>
          <div className="text-[11px] text-[var(--text-faint)]">{differs ? "фактически" : "шанс"}</div>
        </div>
      </div>

      <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <span aria-hidden className="h-3 w-3 shrink-0 rounded-full" style={{ background: color, boxShadow: `0 0 8px ${color}` }} />
          <Select<CaseRarity>
            className="w-[148px]"
            value={it.rarity}
            options={RARITY_OPTIONS}
            onChange={(r) => r !== it.rarity && onPatch({ rarity: r }, `Редкость: ${CASE_RARITY_LABEL[r].toLowerCase()}`)}
          />
        </div>
        <label className="flex items-center gap-1.5" title="Шанс выпадения, % (0,0001…100). Сервер приводит сумму шансов к 100 % по призам, которые могут выпасть">
          <span className="text-[12px] font-semibold text-[var(--text-muted)]">Шанс, %</span>
          <input
            inputMode="decimal"
            aria-label="Шанс, %"
            aria-invalid={chanceError || undefined}
            value={chance}
            disabled={locked}
            onChange={(e) => setChance(e.target.value.replace(/[^\d.,]/g, "").slice(0, 9))}
            onBlur={commitChance}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") setChance(fmtPercent(setPercent));
            }}
            className={cn(
              "tabular focusable h-10 w-[84px] rounded-[var(--r-md)] border bg-[var(--surface-2)] px-2 text-center text-[14px] text-[var(--text)] pointer-coarse:h-11",
              chanceError ? "border-[var(--danger)]" : "border-[var(--line)]"
            )}
          />
        </label>
        {isDiscount && <DiscountValue it={it} locked={locked} onPatch={onPatch} />}
        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          <Toggle checked={it.active} disabled={locked} onChange={(v) => onPatch({ active: v }, v ? "Приз включён" : "Приз выключен")} />
          <IconBtn label="Выше" disabled={locked || first} onClick={() => onMove(-1)}>
            <ArrowUp className="h-4 w-4" />
          </IconBtn>
          <IconBtn label="Ниже" disabled={locked || last} onClick={() => onMove(1)}>
            <ArrowDown className="h-4 w-4" />
          </IconBtn>
          <IconBtn label="Удалить" danger disabled={locked} onClick={onRemove}>
            <Trash2 className="h-4 w-4" />
          </IconBtn>
        </div>
      </div>
    </li>
  );
}

/** Size of a discount prize: a number + «%» / «₴» (the server keeps one of the two). */
function DiscountValue({ it, locked, onPatch }: { it: CaseItemAdmin; locked: boolean; onPatch: (body: CaseItemPatch, ok: string) => void }) {
  const unit: "%" | "₴" = it.discountPercent > 0 ? "%" : "₴";
  const value = unit === "%" ? it.discountPercent : it.discountUah;
  const [raw, setRaw] = useState(String(value));
  useEffect(() => setRaw(String(value)), [value]);
  const n = Number(raw);
  const max = unit === "%" ? 50 : 100_000;
  const bad = !raw || !Number.isInteger(n) || n < 1 || n > max;
  const send = (u: "%" | "₴", v: number) =>
    onPatch(u === "%" ? { discountPercent: v } : { discountUah: v }, `Скидка: ${u === "%" ? `${v} %` : money(v * 100)}`);
  return (
    <span className="flex items-center gap-1.5">
      <span className="text-[12px] font-semibold text-[var(--text-muted)]">Скидка</span>
      <input
        inputMode="numeric"
        aria-label="Размер скидки"
        aria-invalid={bad || undefined}
        value={raw}
        disabled={locked}
        onChange={(e) => setRaw(e.target.value.replace(/\D/g, "").slice(0, 6))}
        onBlur={() => (bad ? setRaw(String(value)) : n !== value && send(unit, n))}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") setRaw(String(value));
        }}
        className={cn(
          "tabular focusable h-10 w-[72px] rounded-[var(--r-md)] border bg-[var(--surface-2)] px-2 text-center text-[14px] text-[var(--text)] pointer-coarse:h-11",
          bad ? "border-[var(--danger)]" : "border-[var(--line)]"
        )}
      />
      <Select<"%" | "₴">
        className="w-[72px]"
        value={unit}
        options={[
          { value: "%", label: "%" },
          { value: "₴", label: "₴" },
        ]}
        onChange={(u) => {
          if (u === unit) return;
          // switching the unit keeps a sensible number: 10 % ↔ 100 ₴
          send(u, u === "%" ? Math.min(50, Math.max(1, Math.round(value / 10))) : Math.max(1, value * 10));
        }}
      />
    </span>
  );
}

function IconBtn({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "focusable hit grid h-8 w-8 place-items-center rounded-[var(--r-sm)] text-[var(--text-muted)] transition-colors disabled:opacity-30",
        danger
          ? "hover:bg-[color-mix(in_srgb,var(--danger)_14%,transparent)] hover:text-[var(--danger-ink)]"
          : "hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
      )}
    >
      {children}
    </button>
  );
}
