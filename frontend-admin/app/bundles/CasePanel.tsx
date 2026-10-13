"use client";

/**
 * «Призы кейса» (gift case, V58): what can drop out of the case the customer gets for the order sum.
 * The server draws the prize at checkout by weights among the active prizes in stock; the chance
 * shown here comes from the server and is refreshed after every change. Each change goes to the
 * server at once (like «Пары категорий»).
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { CASE_RARITY_COLOR, CASE_RARITY_ORDER, type CaseRarity } from "@shop/shared";
import type { AdminProduct } from "@/lib/api";
import { ApiError } from "@/lib/api";
import { bundlesApi, CASE_RARITY_LABEL, type CaseItemAdmin, type CaseItemPatch } from "@/lib/bundles";
import { cn } from "@/lib/cn";
import { Image } from "@/lib/image";
import { money } from "@/lib/money";
import { useToast } from "@/lib/toast";
import { Button } from "@/components/ui/Button";
import { useConfirm } from "@/components/ui/ConfirmModal";
import { QueryState } from "@/components/ui/QueryState";
import { Select } from "@/components/ui/Select";
import { Toggle } from "@/components/ui/Toggle";
import { ProductPickModal } from "./ProductPickModal";

export const CASE_ITEMS_KEY = ["bundles", "case-items"] as const;

const DEFAULT_WEIGHT: Record<CaseRarity, number> = { COMMON: 60, RARE: 24, EPIC: 10, LEGENDARY: 4, GOLD: 1 };

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

export function CasePanel({ thresholdUah }: { thresholdUah: number | null }) {
  const qc = useQueryClient();
  const { push } = useToast();
  const [confirm, confirmUi] = useConfirm();
  const q = useQuery({ queryKey: CASE_ITEMS_KEY, queryFn: bundlesApi.caseItems });
  const items = useMemo(() => [...(q.data ?? [])].sort(byOrder), [q.data]);
  const [busy, setBusy] = useState<number | "add" | null>(null);
  const [picking, setPicking] = useState(false);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: CASE_ITEMS_KEY });
    qc.invalidateQueries({ queryKey: ["bundles", "preview"] });
  };
  const fail = (e: unknown, fallback: string) => push(e instanceof ApiError ? e.message : fallback, "error");

  async function patch(it: CaseItemAdmin, body: CaseItemPatch, okText: string) {
    setBusy(it.id);
    try {
      await bundlesApi.patchCaseItem(it.id, body);
      push(okText, "ok");
      refresh();
    } catch (e) {
      fail(e, "Не удалось сохранить приз");
      refresh();
    } finally {
      setBusy(null);
    }
  }

  /** Swap with the neighbour; equal sort orders → renumber the whole list by 10. */
  async function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const a = items[i];
    const b = items[j];
    setBusy(a.id);
    try {
      if (a.sortOrder !== b.sortOrder) {
        await bundlesApi.patchCaseItem(a.id, { sortOrder: b.sortOrder });
        await bundlesApi.patchCaseItem(b.id, { sortOrder: a.sortOrder });
      } else {
        const next = [...items];
        [next[i], next[j]] = [next[j], next[i]];
        for (let k = 0; k < next.length; k++) {
          const want = (k + 1) * 10;
          if (next[k].sortOrder !== want) await bundlesApi.patchCaseItem(next[k].id, { sortOrder: want });
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
      message: <>«{it.title}» больше не будет выпадать. Уже выданные призы в заказах не изменятся.</>,
      confirmLabel: "Убрать",
      danger: true,
    });
    if (!ok) return;
    setBusy(it.id);
    try {
      await bundlesApi.deleteCaseItem(it.id);
      push("Приз убран", "ok");
      refresh();
    } catch (e) {
      fail(e, "Не удалось удалить");
    } finally {
      setBusy(null);
    }
  }

  async function add(p: AdminProduct) {
    if (items.some((it) => it.productId === p.id)) {
      push("Этот товар уже есть в кейсе", "error");
      return;
    }
    const rarity = rarityByPrice(p.priceMinor);
    setBusy("add");
    try {
      await bundlesApi.createCaseItem({ productId: p.id, rarity, weight: DEFAULT_WEIGHT[rarity], active: true });
      push(`Приз добавлен: ${CASE_RARITY_LABEL[rarity].toLowerCase()}`, "ok");
      refresh();
    } catch (e) {
      fail(e, "Не удалось добавить приз");
    } finally {
      setBusy(null);
    }
  }

  const live = items.filter((it) => it.chancePercent > 0);
  const avgMinor = live.reduce((s, it) => s + (it.chancePercent / 100) * it.priceMinor, 0);
  const share = thresholdUah && thresholdUah > 0 ? (avgMinor / 100 / thresholdUah) * 100 : null;

  return (
    <div className="min-w-0">
      <div className="mb-3 flex min-w-0 items-center gap-3">
        <img src="/case/case-closed-sm.webp" alt="" width={64} height={64} className="h-14 w-14 shrink-0 object-contain" />
        <div className="min-w-0">
          <div className="font-display text-[15px] font-bold text-[var(--ink)]">Призы кейса</div>
          <p className="text-[12.5px] leading-snug text-[var(--text-muted)]">
            Приз выпадает случайно по весам среди включённых призов в наличии. Число рядом с редкостью — вес: чем больше, тем чаще выпадает. Шанс считает сервер.
          </p>
        </div>
      </div>

      <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error} refetch={q.refetch} loadingLabel="Загрузка призов">
        {items.length === 0 ? (
          <p className="card-2 p-3 text-[13px] text-[var(--text-muted)]">
            Призов пока нет — пока их нет, в заказ кладётся обычный товар-подарок.
          </p>
        ) : (
          <ol className="flex min-w-0 flex-col gap-2">
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
            Средняя стоимость приза ≈ <b className="tabular">{money(Math.round(avgMinor / 100) * 100)}</b>{" "}
            <span className="text-[var(--text-faint)]">(по рознице)</span>
          </div>
          {share != null && (
            <div className="mt-0.5 text-[var(--text-muted)]">
              На заказ от порога {money(thresholdUah! * 100)} это ≈{" "}
              <b className="tabular text-[var(--text)]">{share.toLocaleString("ru-RU", { maximumFractionDigits: 1 })} %</b> от порога.
            </div>
          )}
        </div>
      )}
      {items.length > 0 && live.length === 0 && (
        <p className="mt-3 text-[12.5px] font-semibold leading-snug text-[var(--danger-ink)]">
          Ни один приз сейчас не может выпасть (нет в наличии, скрыт или выключен) — в заказ попадёт обычный товар-подарок.
        </p>
      )}

      <Button
        className="mt-3 w-full sm:w-auto"
        variant="accent"
        icon={<Plus className="h-4 w-4" />}
        loading={busy === "add"}
        disabled={busy !== null && busy !== "add"}
        onClick={() => setPicking(true)}
      >
        Добавить приз
      </Button>
      <p className="mt-2 text-[12px] leading-snug text-[var(--text-faint)]">
        Редкость и вес новому призу подставляются по цене — их можно поменять. Товар-подарок выше остаётся запасным: он
        кладётся в заказ, если ни одного приза нет в наличии.
      </p>

      <ProductPickModal open={picking} title="Приз кейса" onClose={() => setPicking(false)} onPick={add} />
      {confirmUi}
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
  const [weight, setWeight] = useState(String(it.weight));
  useEffect(() => setWeight(String(it.weight)), [it.weight]);
  const w = Number(weight);
  const weightError = weight === "" || !Number.isInteger(w) || w < 0 || w > 100000;
  const color = CASE_RARITY_COLOR[it.rarity];
  const cantDrop = it.stock <= 0 || !it.productActive;

  function commitWeight() {
    if (weightError) {
      setWeight(String(it.weight));
      return;
    }
    if (w !== it.weight) onPatch({ weight: w }, `Вес: ${w}`);
  }

  return (
    <li
      className={cn(
        "card-2 min-w-0 border-l-[3px] p-2.5 transition-opacity",
        !it.active && "opacity-60",
        busy && "opacity-50"
      )}
      style={{ borderLeftColor: color }}
    >
      <div className="flex min-w-0 items-start gap-3">
        <Image
          src={it.imageUrl ?? undefined}
          alt={it.title}
          size={96}
          className="h-12 w-12 shrink-0 rounded-[var(--r-sm)] border border-[var(--line)] bg-[var(--surface-3)]"
        />
        <div className="min-w-0 flex-1">
          <div className="break-words text-[13.5px] font-semibold leading-snug text-[var(--text)]">{it.title}</div>
          <div className="tabular mt-0.5 text-[12px] text-[var(--text-faint)]">
            {money(it.priceMinor)} ·{" "}
            <span className={cantDrop ? "font-semibold text-[var(--danger-ink)]" : undefined}>
              {!it.productActive ? "товар скрыт" : it.stock <= 0 ? "нет в наличии" : `${it.stock} шт`}
            </span>
            {cantDrop && it.active && <span className="text-[var(--danger-ink)]"> — не выпадет</span>}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className={cn("tabular font-display text-[16px] font-bold leading-tight", it.chancePercent > 0 ? "text-[var(--ink)]" : "text-[var(--text-faint)]")}>
            {it.chancePercent.toLocaleString("ru-RU", { maximumFractionDigits: 1 })} %
          </div>
          <div className="text-[11px] text-[var(--text-faint)]">шанс</div>
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
        <label className="flex items-center" title="Вес: чем больше, тем чаще выпадает">
          <input
            inputMode="numeric"
            aria-label="Вес"
            value={weight}
            disabled={locked}
            onChange={(e) => setWeight(e.target.value.replace(/[^\d]/g, "").slice(0, 6))}
            onBlur={commitWeight}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") setWeight(String(it.weight));
            }}
            className={cn(
              "tabular focusable h-10 w-[56px] rounded-[var(--r-md)] border bg-[var(--surface-2)] px-2 text-center text-[14px] text-[var(--text)] pointer-coarse:h-11",
              weightError ? "border-[var(--danger)]" : "border-[var(--line)]"
            )}
          />
        </label>
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
