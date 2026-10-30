"use client";

/**
 * «Кейсы» (gift cases, V57) — the case builder (docs/GIFT-CASE.md, «Конструктор»). Three tiers —
 * bronze, silver, gold — each with its threshold of the order sum and its own prizes (products, or
 * discounts on the next order as personal promo codes). The order gets the dearest tier its sum reaches.
 *
 * The prizes are a board by rarity. Every edit goes into a per-tier draft (chances always sum to 100 %
 * over the prizes that can drop: one change rescales the others) and reaches customers only on
 * «Опубликовать» (PUT …/tiers/{tier}/items, one transaction). «Тест кейса» runs on the draft, «Автособрать»
 * fills it from the catalog. The summary weighs a case against the margin on an order at the threshold
 * (no cost price in the shop: a product prize costs price × (1 − average margin), a discount its amount).
 *
 * Tier settings (threshold, guaranteed discount, swap, promo validity) are saved at once, apart from the draft.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Dices, Lock, Package, Percent, Rocket, Settings2, Sparkles, Undo2 } from "lucide-react";
import { CASE_RARITY_COLOR, CASE_TIER_METAL, CASE_TIER_ORDER, type CaseRarity, type CaseTier } from "@shop/core/giftcase";
import type { AdminProduct } from "@/lib/api";
import { ApiError } from "@/lib/api";
import {
  CASE_RARITY_LABEL,
  CASE_TIER_LABEL,
  giftApi,
  type AutofillResult,
  type CaseItemAdmin,
  type GiftTierAdmin,
  type GiftTierPatch,
} from "@/lib/gift";
import { cn } from "@/lib/cn";
import { Image } from "@/lib/image";
import { money } from "@/lib/money";
import { productStock } from "@/lib/stock";
import { useToast } from "@/lib/toast";
import { useUnsavedGuard } from "@/lib/use-unsaved-guard";
import { Button } from "@/components/ui/Button";
import { useConfirm } from "@/components/ui/ConfirmModal";
import { QueryState } from "@/components/ui/QueryState";
import { Toggle } from "@/components/ui/Toggle";
import { ProductPickModal } from "@/components/ProductPickModal";
import { CaseAutofillModal } from "./CaseAutofillModal";
import { CasePrizeModal, DiscountBadge } from "./CasePrizeModal";
import { CaseTestModal } from "./CaseTestModal";
import { CaseTierSettingsModal } from "./CaseTierSettings";
import {
  addRow,
  canDrop,
  changes,
  defaultDiscountUah,
  fmtPct,
  fromDraftItem,
  fromServer,
  lanesOf,
  newKey,
  normalize,
  parsePct,
  removeRow,
  setChance,
  setLaneShare,
  sortRows,
  summarize,
  toDraft,
  type Row,
  type Summary,
} from "./case-draft";

export const CASE_ITEMS_KEY = ["gift", "case-items"] as const;
export const CASE_TIERS_KEY = ["gift", "tiers"] as const;

const tierArt = (t: CaseTier) => `/case/${t.toLowerCase()}/case-closed-sm.webp`;

const byOrder = (a: CaseItemAdmin, b: CaseItemAdmin) => a.sortOrder - b.sortOrder || a.id - b.id;

export function CasePanel({ reminderDays }: { reminderDays: number | null }) {
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
  const publishedOf = (t: CaseTier) => (itemsQ.data ?? []).filter((it) => it.tier === t).sort(byOrder);
  const published = useMemo(() => publishedOf(tier), [itemsQ.data, tier]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Drafts by tier; absent = the published case. */
  const [drafts, setDrafts] = useState<Partial<Record<CaseTier, Row[]>>>({});
  const [warnings, setWarnings] = useState<Partial<Record<CaseTier, string[]>>>({});
  const rows = useMemo(() => drafts[tier] ?? published.map(fromServer), [drafts, tier, published]);
  const changed = drafts[tier] ? changes(drafts[tier]!, published) : 0;
  const dirtyTiers = CASE_TIER_ORDER.filter((t) => drafts[t] && changes(drafts[t]!, publishedOf(t)) > 0);
  useUnsavedGuard(dirtyTiers.length > 0);

  const sum = useMemo(() => summarize(rows, current), [rows, current]);
  const [busy, setBusy] = useState<"tier" | "publish" | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState<CaseRarity | null>(null);
  const [testing, setTesting] = useState(false);
  const [filling, setFilling] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const fail = (e: unknown, fallback: string) => push(e instanceof ApiError ? e.message : fallback, "error");
  const edit = (fn: (rows: Row[]) => Row[]) => setDrafts((d) => ({ ...d, [tier]: fn(d[tier] ?? published.map(fromServer)) }));
  const discard = () => {
    setDrafts((d) => ({ ...d, [tier]: undefined }));
    setWarnings((w) => ({ ...w, [tier]: undefined }));
  };

  async function patchTier(body: GiftTierPatch, okText: string) {
    setBusy("tier");
    try {
      const fresh = await giftApi.patchTier(tier, body);
      qc.setQueryData<GiftTierAdmin[]>(CASE_TIERS_KEY, (old) => (old ?? []).map((t) => (t.tier === fresh.tier ? fresh : t)));
      push(okText, "ok");
    } catch (e) {
      fail(e, "Не удалось сохранить кейс");
      qc.invalidateQueries({ queryKey: CASE_TIERS_KEY });
    } finally {
      setBusy(null);
    }
  }

  async function publish() {
    const draft = drafts[tier];
    if (!draft) return;
    if (draft.length > 0 && sum.live === 0) {
      push("Ни один приз черновика не может выпасть — проверьте наличие и шансы", "error");
      return;
    }
    const ok = await confirm({
      title: `Опубликовать ${CASE_TIER_LABEL[tier].toLowerCase()} кейс?`,
      message: (
        <>
          Покупатели сразу начнут получать призы из черновика ({draft.length} шт., изменений: {changed}). Уже выданные призы в заказах не
          изменятся.
        </>
      ),
      confirmLabel: "Опубликовать",
    });
    if (!ok) return;
    setBusy("publish");
    try {
      const fresh = await giftApi.replaceItems(tier, toDraft(draft));
      qc.setQueryData<CaseItemAdmin[]>(CASE_ITEMS_KEY, fresh);
      setDrafts((d) => ({ ...d, [tier]: undefined }));
      push(`${CASE_TIER_LABEL[tier]} кейс опубликован`, "ok");
      qc.invalidateQueries({ queryKey: CASE_TIERS_KEY });
      qc.invalidateQueries({ queryKey: ["gift", "stats"] });
    } catch (e) {
      fail(e, "Не удалось опубликовать");
    } finally {
      setBusy(null);
    }
  }

  function addProduct(rarity: CaseRarity, p: AdminProduct) {
    if (rows.some((r) => r.productId === p.id)) {
      push("Этот товар уже есть в этом кейсе", "error");
      return;
    }
    edit((rs) =>
      addRow(rs, {
        key: newKey(),
        id: null,
        kind: "PRODUCT",
        productId: p.id,
        discountPercent: 0,
        discountUah: 0,
        rarity,
        weight: 0,
        active: true,
        title: p.title,
        imageUrl: p.images?.[0]?.url ?? null,
        priceMinor: p.priceMinor,
        stock: productStock(p),
        productActive: p.active !== false && !p.archived,
        category: null,
      })
    );
  }

  function addDiscount(rarity: CaseRarity) {
    const uah = defaultDiscountUah(rarity, current?.thresholdUah ?? 1000);
    const key = newKey();
    edit((rs) =>
      addRow(rs, {
        key,
        id: null,
        kind: "DISCOUNT",
        productId: null,
        discountPercent: 0,
        discountUah: uah,
        rarity,
        weight: 0,
        active: true,
        title: `Скидка ${uah} ₴`,
        imageUrl: null,
        priceMinor: 0,
        stock: 0,
        productActive: true,
        category: null,
      })
    );
    setEditing(key);
  }

  function applyAutofill(res: AutofillResult) {
    const locked = rows.filter((r) => r.locked);
    const next = res.items.map((x) => {
      // A locked prize comes back as it was (key, lock) with its new chance.
      const keep = locked.find((r) => (x.productId ? r.productId === x.productId : r.kind === "DISCOUNT" && r.id != null && r.id === x.id));
      if (keep) return { ...keep, weight: x.weight };
      // A product already published keeps its row id.
      const old = x.productId ? published.find((it) => it.productId === x.productId) : undefined;
      return fromDraftItem(old ? { ...x, id: old.id } : x);
    });
    setDrafts((d) => ({ ...d, [tier]: next }));
    setWarnings((w) => ({ ...w, [tier]: res.warnings }));
    push(`Собрано: ${res.items.length} призов — проверьте и опубликуйте`, "ok");
  }

  const editingRow = rows.find((r) => r.key === editing) ?? null;
  const lanes = lanesOf(tier, rows);
  const sorted = sortRows(rows);
  const anyEnabled = tiers.some((t) => t.enabled && t.livePrizes > 0);

  return (
    <div className="min-w-0">
      <div className="mb-3 min-w-0">
        <div className="font-display text-[16px] font-bold text-[var(--ink)]">Кейсы</div>
        <p className="text-[12.5px] leading-snug text-[var(--text-muted)]">
          Заказ получает самый дорогой кейс, до порога которого дотянул (сумма после скидок). Правки призов копятся в черновике и доходят до
          покупателей только после «Опубликовать». Шансы покупатели не видят.
        </p>
      </div>

      <QueryState isLoading={tiersQ.isLoading} isError={tiersQ.isError} error={tiersQ.error} refetch={tiersQ.refetch} loadingLabel="Загрузка кейсов">
        <div role="tablist" aria-label="Кейс" className="grid min-w-0 grid-cols-3 gap-2 lg:max-w-[560px]">
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
                onClick={() => {
                  setTier(t);
                  setEditing(null);
                }}
                className={cn(
                  "focusable card-2 relative flex min-w-0 flex-col items-center gap-1 px-1.5 pb-2 pt-1.5 text-center transition-[border-color,background] duration-200",
                  on ? "!border-[var(--tier)] bg-[color-mix(in_srgb,var(--tier)_10%,var(--surface-2))]" : "hover:bg-[var(--surface-hover)]",
                  d && !d.enabled && "opacity-60"
                )}
                style={{ ["--tier" as string]: m.ga }}
              >
                {dirtyTiers.includes(t) && (
                  <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-[var(--accent)]" title="Есть неопубликованный черновик" />
                )}
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

        {current && (
          <div className="mt-3 flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <Toggle
              checked={current.enabled}
              disabled={busy === "tier"}
              onChange={(v) => void patchTier({ enabled: v }, v ? `${CASE_TIER_LABEL[tier]} кейс включён` : `${CASE_TIER_LABEL[tier]} кейс выключен`)}
              label={`${CASE_TIER_LABEL[tier]} кейс разыгрывается`}
            />
            <Button size="sm" variant="ghost" icon={<Settings2 className="h-4 w-4" />} onClick={() => setSettingsOpen(true)}>
              Порог, скидка, промокод
            </Button>
          </div>
        )}
      </QueryState>

      <DraftBar
        changed={changed}
        hasDraft={!!drafts[tier]}
        total={rows.length}
        busy={busy === "publish"}
        onDiscard={discard}
        onPublish={() => void publish()}
      />

      <QueryState isLoading={itemsQ.isLoading} isError={itemsQ.isError} error={itemsQ.error} refetch={itemsQ.refetch} loadingLabel="Загрузка призов">
        <div className="mt-3 grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="order-2 flex min-w-0 flex-col gap-3 lg:order-1">
            {rows.length === 0 && (
              <div className="card-2 flex min-w-0 flex-wrap items-center justify-between gap-3 p-3">
                <p className="min-w-0 flex-1 text-[13px] text-[var(--text-muted)]">
                  Призов нет — этот кейс не разыгрывается. Соберите его автоматически или добавьте призы в нужную редкость.
                </p>
                <Button variant="accent" icon={<Sparkles className="h-4 w-4" />} onClick={() => setFilling(true)}>
                  Автособрать
                </Button>
              </div>
            )}
            {lanes.map((r) => (
              <Lane
                key={r}
                rarity={r}
                rows={sorted.filter((x) => x.rarity === r)}
                sum={sum}
                onShare={(p) => edit((rs) => setLaneShare(rs, r, p))}
                onOpen={setEditing}
                onAddProduct={() => setAdding(r)}
                onAddDiscount={() => addDiscount(r)}
              />
            ))}
          </div>

          <aside className="order-1 min-w-0 lg:order-2">
            <div className="flex min-w-0 flex-col gap-3 lg:sticky lg:top-4">
              <SummaryCard t={current} sum={sum} warnings={warnings[tier] ?? []} />
              <div className="grid min-w-0 grid-cols-2 gap-2">
                <Button variant="surface" icon={<Sparkles className="h-4 w-4" />} onClick={() => setFilling(true)}>
                  Автособрать
                </Button>
                <Button variant="outline" icon={<Dices className="h-4 w-4" />} disabled={sum.live === 0} onClick={() => setTesting(true)}>
                  Тест{drafts[tier] ? " черновика" : ""}
                </Button>
              </div>
            </div>
          </aside>
        </div>
      </QueryState>

      <CasePrizeModal
        open={!!editingRow}
        onClose={() => setEditing(null)}
        tier={tier}
        row={editingRow}
        chance={editingRow ? sum.chance.get(editingRow.key) ?? 0 : 0}
        perMonth={editingRow ? sum.perMonth.get(editingRow.key) ?? 0 : 0}
        usedProducts={rows.map((r) => r.productId).filter((x): x is string => !!x)}
        onChance={(p) => editingRow && edit((rs) => setChance(rs, editingRow.key, p))}
        onPatch={(patch) =>
          editingRow &&
          edit((rs) => {
            const next = rs.map((r) => (r.key === editingRow.key ? { ...r, ...patch } : r));
            // Switching a prize on/off moves its chance to / from the others.
            return "active" in patch ? normalize(next) : next;
          })
        }
        onReplace={(x) => {
          if (!editingRow) return;
          const key = newKey();
          const old = published.find((it) => it.productId === x.productId);
          edit((rs) => normalize(rs.map((r) => (r.key === editingRow.key ? { ...fromDraftItem({ ...x, id: old?.id ?? null }), key } : r))));
          setEditing(key);
        }}
        onRemove={() => {
          if (!editingRow) return;
          edit((rs) => removeRow(rs, editingRow.key));
          setEditing(null);
        }}
      />
      <ProductPickModal
        open={adding !== null}
        title={adding ? `Приз · ${CASE_RARITY_LABEL[adding].toLowerCase()}` : "Приз"}
        onClose={() => setAdding(null)}
        onPick={(p) => {
          if (adding) addProduct(adding, p);
          setAdding(null);
        }}
      />
      <CaseTestModal
        open={testing}
        onClose={() => setTesting(false)}
        tier={tier}
        items={rows.map((r, i) => toAdminItem(r, i, tier, sum))}
        draft={drafts[tier] ? toDraft(drafts[tier]!) : null}
        lowMarginPercent={current?.lowMarginProductPercent}
      />
      <CaseAutofillModal open={filling} onClose={() => setFilling(false)} tier={tier} t={current} rows={rows} onResult={applyAutofill} />
      {current && (
        <CaseTierSettingsModal
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          t={current}
          busy={busy === "tier"}
          onPatch={(b, ok) => void patchTier(b, ok)}
          reminderDays={reminderDays}
        />
      )}
      {confirmUi}
    </div>
  );
}

/** A board row as the test modal reads it; a new draft prize gets the test's id −(index + 1). */
function toAdminItem(r: Row, i: number, tier: CaseTier, sum: Summary): CaseItemAdmin {
  return {
    id: r.id ?? -(i + 1),
    tier,
    kind: r.kind,
    productId: r.productId,
    title: r.title,
    imageUrl: r.imageUrl,
    priceMinor: r.priceMinor,
    stock: r.stock,
    productActive: r.productActive,
    discountPercent: r.discountPercent,
    discountUah: r.discountUah,
    rarity: r.rarity,
    weight: r.weight,
    chancePercent: sum.chance.get(r.key) ?? 0,
    sortOrder: (i + 1) * 10,
    active: r.active,
  };
}

function DraftBar({
  changed,
  hasDraft,
  total,
  busy,
  onDiscard,
  onPublish,
}: {
  changed: number;
  hasDraft: boolean;
  total: number;
  busy: boolean;
  onDiscard: () => void;
  onPublish: () => void;
}) {
  if (!hasDraft || changed === 0) {
    return (
      <div className="mt-3 flex min-w-0 items-center gap-2 text-[12.5px] text-[var(--text-faint)]">
        <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--ok,#3ecf8e)]" aria-hidden />
        Опубликовано · призов: {total}
        {hasDraft && (
          <button type="button" className="focusable ml-1 underline-offset-2 hover:underline" onClick={onDiscard}>
            сбросить черновик
          </button>
        )}
      </div>
    );
  }
  return (
    <div className="card-2 mt-3 flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 !border-[color-mix(in_srgb,var(--accent)_55%,var(--line))] px-3 py-2.5">
      <div className="min-w-0 text-[13px] leading-snug">
        <b className="text-[var(--ink)]">Черновик</b> · изменений: <span className="tabular">{changed}</span>
        <span className="block text-[12px] text-[var(--text-muted)]">Покупатели пока видят опубликованный кейс</span>
      </div>
      <div className="flex flex-1 justify-end gap-2 sm:flex-none">
        <Button size="sm" variant="ghost" icon={<Undo2 className="h-4 w-4" />} disabled={busy} onClick={onDiscard}>
          Отменить
        </Button>
        <Button size="sm" variant="accent" icon={<Rocket className="h-4 w-4" />} loading={busy} onClick={onPublish}>
          Опубликовать
        </Button>
      </div>
    </div>
  );
}

function SummaryCard({ t, sum, warnings }: { t: GiftTierAdmin | null; sum: Summary; warnings: string[] }) {
  const costTone = sum.costShare <= 70 ? "var(--ok,#3ecf8e)" : sum.costShare <= 100 ? "var(--warn)" : "var(--danger-ink)";
  const shares = (Object.entries(sum.share) as [CaseRarity, number][]).filter(([, v]) => v > 0);
  const notes = [
    ...warnings,
    ...sum.shortStock.map((r) => `${r.title}: ≈ ${fmtPct(sum.perMonth.get(r.key) ?? 0, 1)} в месяц, на складе ${r.stock}`),
  ];
  return (
    <div className="card-2 min-w-0 p-3">
      <div className="field-label">Шансы по редкостям</div>
      <div className="mt-2 flex h-3 min-w-0 overflow-hidden rounded-full bg-[var(--surface-3)]" role="img" aria-label="Шансы по редкостям">
        {shares.map(([r, v]) => (
          <span key={r} style={{ width: `${Math.max(v, 0.8)}%`, background: CASE_RARITY_COLOR[r] }} title={`${CASE_RARITY_LABEL[r]}: ${fmtPct(v)} %`} />
        ))}
      </div>
      <div className="mt-1.5 flex min-w-0 flex-wrap gap-x-3 gap-y-0.5 text-[11.5px] text-[var(--text-muted)]">
        {shares.map(([r, v]) => (
          <span key={r} className="tabular inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full" style={{ background: CASE_RARITY_COLOR[r] }} aria-hidden />
            {fmtPct(v, 1)} %
          </span>
        ))}
        {shares.length === 0 && <span>нечему выпадать</span>}
      </div>

      <dl className="mt-3 grid min-w-0 grid-cols-[1fr_auto] gap-x-3 gap-y-1.5 text-[13px]">
        <dt className="text-[var(--text-muted)]">Средний приз</dt>
        <dd className="tabular text-right font-semibold text-[var(--text)]">{money(Math.round(sum.avgPrizeMinor / 100) * 100)}</dd>
        <dt className="text-[var(--text-muted)]">Кейс обходится в</dt>
        <dd className="tabular text-right font-bold" style={{ color: costTone }}>
          ≈ {money(Math.round(sum.avgCostMinor / 100) * 100)}
        </dd>
        <dt className="text-[var(--text-muted)]">Маржа с заказа на пороге</dt>
        <dd className="tabular text-right text-[var(--text)]">{money(Math.round(sum.marginMinor / 100) * 100)}</dd>
        <dt className="text-[var(--text-muted)]">Доля маржи на кейс</dt>
        <dd className="tabular text-right font-semibold" style={{ color: costTone }}>
          {fmtPct(sum.costShare, 0)} %
        </dd>
        {sum.guaranteedMinor > 0 && (
          <>
            <dt className="text-[var(--text-muted)]">Скидка вместо кейса</dt>
            <dd className="tabular text-right text-[var(--text)]">{money(sum.guaranteedMinor)}</dd>
          </>
        )}
        <dt className="text-[var(--text-muted)]">Кейсов в месяц</dt>
        <dd className="tabular text-right text-[var(--text)]">≈ {fmtPct(sum.monthly, 1)}</dd>
      </dl>
      <p className="mt-2 text-[11px] leading-snug text-[var(--text-faint)]">
        Себестоимость нет — считаю товар-приз по цене минус средняя маржа {t?.marginPercent ?? 15} %, скидку — полной суммой. Кейсов в месяц — по
        заказам этого уровня за 90 дней.
      </p>
      {sum.guaranteedMinor > 0 && sum.avgCostMinor > 0 && (
        <p className="mt-1.5 text-[12px] leading-snug text-[var(--text-muted)]">
          {sum.guaranteedMinor > sum.avgCostMinor
            ? "Гарантированная скидка дороже кейса — выбравшие скидку обходятся дороже."
            : "Кейс дороже гарантированной скидки — кейс заметно привлекательнее."}
        </p>
      )}
      {notes.length > 0 && (
        <ul className="mt-2.5 flex min-w-0 flex-col gap-1 border-t border-[var(--line)] pt-2.5">
          {notes.map((w, i) => (
            <li key={i} className="flex min-w-0 items-start gap-1.5 text-[12px] leading-snug text-[var(--warn)]">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0 break-words">{w}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Lane({
  rarity,
  rows,
  sum,
  onShare,
  onOpen,
  onAddProduct,
  onAddDiscount,
}: {
  rarity: CaseRarity;
  rows: Row[];
  sum: Summary;
  onShare: (percent: number) => void;
  onOpen: (key: string) => void;
  onAddProduct: () => void;
  onAddDiscount: () => void;
}) {
  const color = CASE_RARITY_COLOR[rarity];
  const share = sum.share[rarity];
  const live = rows.some(canDrop);
  return (
    <section
      className="card-2 min-w-0 border-l-[3px] p-2.5"
      style={{ borderLeftColor: color, background: `linear-gradient(90deg, color-mix(in srgb, ${color} 7%, transparent), transparent 40%)` }}
      aria-label={CASE_RARITY_LABEL[rarity]}
    >
      <header className="flex min-w-0 items-center gap-2">
        <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color, boxShadow: `0 0 8px ${color}` }} />
        <span className="min-w-0 truncate font-display text-[13.5px] font-bold" style={{ color }}>
          {rarity === "GOLD" ? "Джекпот" : CASE_RARITY_LABEL[rarity]}
        </span>
        <span className="tabular text-[12px] text-[var(--text-faint)]">{rows.length}</span>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          {live && <ShareInput value={share} onCommit={onShare} />}
          <LaneBtn label="Добавить товар" onClick={onAddProduct}>
            <Package className="h-4 w-4" />
          </LaneBtn>
          <LaneBtn label="Добавить скидку" onClick={onAddDiscount}>
            <Percent className="h-4 w-4" />
          </LaneBtn>
        </div>
      </header>
      {rows.length > 0 && (
        <ul className="mt-2 grid min-w-0 grid-cols-1 gap-1.5 xl:grid-cols-2">
          {rows.map((r) => (
            <PrizeRow key={r.key} r={r} chance={sum.chance.get(r.key) ?? 0} perMonth={sum.perMonth.get(r.key) ?? 0} onOpen={() => onOpen(r.key)} />
          ))}
        </ul>
      )}
    </section>
  );
}

function PrizeRow({ r, chance, perMonth, onOpen }: { r: Row; chance: number; perMonth: number; onOpen: () => void }) {
  const isProduct = r.kind === "PRODUCT";
  const cantDrop = isProduct && (r.stock <= 0 || !r.productActive);
  const short = isProduct && !cantDrop && perMonth > r.stock;
  return (
    <li className="min-w-0">
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          "focusable flex w-full min-w-0 items-center gap-2.5 rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] p-1.5 pr-2.5 text-left transition-colors hover:border-[var(--line-strong)] hover:bg-[var(--surface-3)]",
          !r.active && "opacity-55"
        )}
      >
        {isProduct ? (
          <Image
            src={r.imageUrl ?? undefined}
            alt={r.title}
            size={80}
            className="h-10 w-10 shrink-0 rounded-[var(--r-sm)] border border-[var(--line)] bg-[var(--surface-3)]"
          />
        ) : (
          <DiscountBadge row={r} size={40} />
        )}
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-1">
            {r.locked && <Lock className="h-3 w-3 shrink-0 text-[var(--text-faint)]" aria-label="Закреплён" />}
            <span className="line-clamp-1 break-all text-[13px] font-semibold leading-snug text-[var(--text)]">{r.title}</span>
          </span>
          <span className="tabular block truncate text-[11.5px] leading-snug text-[var(--text-faint)]">
            {isProduct ? (
              <>
                {money(r.priceMinor)} ·{" "}
                <span className={cantDrop || short ? "font-semibold text-[var(--danger-ink)]" : undefined}>
                  {!r.productActive ? "скрыт" : r.stock <= 0 ? "нет в наличии" : `${r.stock} шт`}
                </span>
                {!r.active && " · выкл"}
              </>
            ) : (
              <>промокод{!r.active && " · выкл"}</>
            )}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className={cn("tabular block font-display text-[14px] font-bold leading-tight", chance > 0 ? "text-[var(--ink)]" : "text-[var(--text-faint)]")}>
            {fmtPct(chance)} %
          </span>
          {perMonth >= 0.05 && <span className="tabular block text-[10.5px] leading-tight text-[var(--text-faint)]">≈{fmtPct(perMonth, 1)}/мес</span>}
        </span>
      </button>
    </li>
  );
}

/** A rarity's total chance, editable: the prizes inside keep their proportions, the other rarities make room. */
function ShareInput({ value, onCommit }: { value: number; onCommit: (p: number) => void }) {
  const [raw, setRaw] = useState(fmtPct(value));
  useEffect(() => setRaw(fmtPct(value)), [value]);
  const parsed = parsePct(raw);
  return (
    <label className="flex items-center gap-1" title="Доля редкости, %: призы внутри сохраняют пропорции, остальные редкости подвинутся">
      <input
        inputMode="decimal"
        aria-label="Доля редкости, %"
        aria-invalid={parsed === null || undefined}
        value={raw}
        onChange={(e) => setRaw(e.target.value.replace(/[^\d.,]/g, "").slice(0, 7))}
        onBlur={() => (parsed === null ? setRaw(fmtPct(value)) : Math.abs(parsed - value) > 0.005 && onCommit(parsed))}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") setRaw(fmtPct(value));
        }}
        className={cn(
          "tabular focusable h-8 w-[64px] rounded-[var(--r-sm)] border bg-[var(--surface-2)] px-1.5 text-center text-[13px] font-semibold text-[var(--text)] pointer-coarse:h-9",
          parsed === null ? "border-[var(--danger)]" : "border-[var(--line)]"
        )}
      />
      <span className="text-[12px] text-[var(--text-faint)]">%</span>
    </label>
  );
}

function LaneBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="focusable hit grid h-8 w-8 place-items-center rounded-[var(--r-sm)] text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text)] pointer-coarse:h-9 pointer-coarse:w-9"
    >
      {children}
    </button>
  );
}
