"use client";

/**
 * Поставка: создание и правка. Срок — дата / диапазон / «примерно через N недель» / не показывать.
 * Закупочная цена и курс — только главному админу. Позиции правятся, пока поставка не приехала.
 */
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { ApiError } from "@/lib/api";
import type { AdminProduct } from "@/features/product/model/types";
import {
  CURRENCIES,
  DISTRIBUTIONS,
  ETA_MODES,
  PREORDERS_KEY,
  fmtDay,
  fxToInput,
  inputToFx,
  isOpenStatus,
  isoInDays,
  lineTitle,
  preordersApi,
  weeksUntil,
  type Batch,
  type Distribution,
  type EtaMode,
} from "@/lib/preorders";
import { useShopSetting } from "@/features/settings";
import { toast } from "@shop/ui/toast";
import { Image } from "@/lib/image";
import { useIsSuperAdmin } from "@/features/staff";
import { ProductPickModal } from "@/components/ProductPickModal";
import { Button } from "@shop/ui/admin-button";
import { Input } from "@/components/ui/Input";
import { Modal, ModalCancel } from "@shop/ui/overlay";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { Toggle } from "@/components/ui/Toggle";
import { SupplierModal } from "./SupplierModal";

export interface SeedLine {
  productId: string;
  variantId: string | null;
  title: string;
  variantName: string | null;
  imageUrl: string | null;
  qty?: number;
}

interface Line {
  key: string;
  id: number | null;
  productId: string;
  variantId: string | null;
  title: string;
  variantName: string | null;
  imageUrl: string | null;
  qty: string;
  price: string;
}

let seq = 0;
const newKey = () => `l${++seq}`;

export function BatchFormModal({
  open,
  onClose,
  batch,
  seed,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  /** Есть — правка, нет — создание. */
  batch?: Batch | null;
  /** Позиции для новой поставки («Заказать у завода»); при правке — добавляются к существующим. */
  seed?: SeedLine[];
  onSaved?: (b: Batch) => void;
}) {
  const qc = useQueryClient();
  const isSuper = useIsSuperAdmin();
  const defHold = useShopSetting("preorder.holdHours", 24);
  const money = batch ? batch.moneyVisible : !!isSuper;
  const itemsLocked = !!batch && !isOpenStatus(batch.status);

  const suppliersQ = useQuery({ queryKey: [...PREORDERS_KEY, "suppliers"], queryFn: preordersApi.suppliers, enabled: open });

  const [title, setTitle] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [privateNote, setPrivateNote] = useState("");
  const [publicNote, setPublicNote] = useState("");
  const [etaMode, setEtaMode] = useState<EtaMode>("RANGE");
  const [etaFrom, setEtaFrom] = useState("");
  const [etaTo, setEtaTo] = useState("");
  const [weeks, setWeeks] = useState("3");
  const [holdHours, setHoldHours] = useState("24");
  const [distribution, setDistribution] = useState<Distribution>("QUEUE_HOLD");
  const [preorderOpen, setPreorderOpen] = useState(true);
  const [currency, setCurrency] = useState("USD");
  const [fxRate, setFxRate] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [pick, setPick] = useState(false);
  const [variantsOf, setVariantsOf] = useState<AdminProduct | null>(null);
  const [supplierModal, setSupplierModal] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Заполняем форму при каждом открытии.
  useEffect(() => {
    if (!open) return;
    setError(null);
    setDirty(false);
    if (batch) {
      setTitle(batch.title);
      setSupplierId(batch.supplierId != null ? String(batch.supplierId) : "");
      setPrivateNote(batch.privateNote ?? "");
      setPublicNote(batch.publicNote ?? "");
      setEtaMode(batch.etaMode);
      setEtaFrom(batch.etaMode === "APPROX" ? "" : batch.etaFrom ?? "");
      setEtaTo(batch.etaTo ?? "");
      setWeeks(String(Math.max(1, weeksUntil(batch.etaTo)) || 3));
      setHoldHours(String(batch.holdHours));
      setDistribution(batch.distribution);
      setPreorderOpen(batch.preorderOpen);
      setCurrency(batch.currency ?? "USD");
      setFxRate(batch.fxRate != null ? String(batch.fxRate) : "");
      setLines(
        batch.items.map((i) => ({
          key: newKey(),
          id: i.id,
          productId: i.productId,
          variantId: i.variantId,
          title: i.title,
          variantName: i.variantName,
          imageUrl: i.imageUrl,
          qty: String(i.qtyOrdered),
          price: fxToInput(i.unitPriceFx),
        }))
      );
      // «Добавить в открытую поставку»: новые позиции в конец, без повторов.
      const extra = (seed ?? []).filter((x) => !batch.items.some((i) => i.productId === x.productId && (i.variantId ?? null) === (x.variantId ?? null)));
      if (extra.length > 0) {
        setLines((ls) => [
          ...ls,
          ...extra.map((x) => ({
            key: newKey(),
            id: null,
            productId: x.productId,
            variantId: x.variantId,
            title: x.title,
            variantName: x.variantName,
            imageUrl: x.imageUrl,
            qty: String(x.qty ?? 1),
            price: "",
          })),
        ]);
        setDirty(true);
      }
    } else {
      setTitle("");
      setSupplierId("");
      setPrivateNote("");
      setPublicNote("");
      setEtaMode("APPROX");
      setEtaFrom("");
      setEtaTo("");
      setWeeks("3");
      setHoldHours(String(defHold));
      setDistribution("QUEUE_HOLD");
      setPreorderOpen(true);
      setCurrency("USD");
      setFxRate("");
      setLines(
        (seed ?? []).map((s) => ({
          key: newKey(),
          id: null,
          productId: s.productId,
          variantId: s.variantId,
          title: s.title,
          variantName: s.variantName,
          imageUrl: s.imageUrl,
          qty: String(s.qty ?? 1),
          price: "",
        }))
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, batch?.id]);

  function touch<T>(set: (v: T) => void) {
    return (v: T) => {
      set(v);
      setDirty(true);
    };
  }

  const approxDate = useMemo(() => isoInDays(Math.max(0, Number(weeks) || 0) * 7), [weeks]);

  function addLine(p: AdminProduct, variantId: string | null, variantName: string | null) {
    setLines((ls) => {
      if (ls.some((l) => l.productId === p.id && l.variantId === variantId)) return ls;
      return [
        ...ls,
        { key: newKey(), id: null, productId: p.id, variantId, title: p.title, variantName, imageUrl: p.images?.[0]?.url ?? null, qty: "1", price: "" },
      ];
    });
    setDirty(true);
  }

  function onPick(p: AdminProduct) {
    if (p.variants && p.variants.length > 0) setVariantsOf(p);
    else addLine(p, null, null);
  }

  const save = useMutation({
    mutationFn: async () => {
      const mode = etaMode;
      const body = {
        title: title.trim(),
        supplierId: supplierId ? Number(supplierId) : null,
        privateNote: privateNote.trim() || null,
        publicNote: publicNote.trim() || null,
        etaMode: mode,
        etaFrom: mode === "DATE" || mode === "RANGE" ? etaFrom || null : null,
        etaTo: mode === "RANGE" ? etaTo || null : mode === "APPROX" ? approxDate : null,
        holdHours: Number(holdHours) || defHold,
        distribution,
        preorderOpen,
        ...(money ? { currency, fxRate: fxRate.trim() ? Number(fxRate.replace(",", ".")) : null } : {}),
        ...(itemsLocked
          ? {}
          : {
              items: lines.map((l) => ({
                id: l.id,
                productId: l.productId,
                variantId: l.variantId,
                qtyOrdered: Number(l.qty) || 0,
                unitPriceFx: money ? inputToFx(l.price) : null,
              })),
            }),
      };
      return batch ? preordersApi.update(batch.id, body) : preordersApi.create(body);
    },
    onSuccess: (b) => {
      qc.invalidateQueries({ queryKey: PREORDERS_KEY });
      toast.success(batch ? "Поставка сохранена" : "Поставка создана");
      setDirty(false);
      onSaved?.(b);
      onClose();
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : "Не удалось сохранить"),
  });

  function submit() {
    setError(null);
    if (!itemsLocked && lines.length === 0) return setError("Добавьте хотя бы одну позицию");
    if (!itemsLocked && lines.some((l) => !(Number(l.qty) >= 1))) return setError("Сколько заказано — от 1 у каждой позиции");
    if (etaMode === "DATE" && !etaFrom) return setError("Укажите дату");
    if (etaMode === "RANGE" && (!etaFrom || !etaTo || etaTo < etaFrom)) return setError("Диапазон: «с» не позже «по»");
    if (etaMode === "APPROX" && !(Number(weeks) >= 0)) return setError("Укажите, через сколько недель");
    if (money && fxRate.trim() && !(Number(fxRate.replace(",", ".")) > 0)) return setError("Курс должен быть больше нуля");
    save.mutate();
  }

  const supplierOptions = [{ value: "", label: "— без поставщика —" }, ...(suppliersQ.data ?? []).map((s) => ({ value: String(s.id), label: s.name }))];

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        size="lg"
        closeOnBackdrop={false}
        dirty={dirty}
        title={batch ? "Поставка" : "Новая поставка"}
        footer={
          <>
            {error && <p className="mr-auto min-w-0 text-[13px] text-[var(--danger-ink)]">{error}</p>}
            <ModalCancel />
            <Button variant="accent" loading={save.isPending} onClick={submit}>
              {batch ? "Сохранить" : "Создать"}
            </Button>
          </>
        }
      >
        <div className="flex min-w-0 flex-col gap-4">
          <Input label="Название (для себя)" value={title} onChange={(e) => touch(setTitle)(e.target.value)} placeholder="Lamzu, заказ 27.10" />

          <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <Select label="Поставщик" value={supplierId} options={supplierOptions} onChange={touch(setSupplierId)} placeholder="Выбрать…" />
            <Button variant="outline" icon={<Plus className="h-4 w-4" />} onClick={() => setSupplierModal(true)}>
              Новый поставщик
            </Button>
          </div>

          <Textarea label="Заметка для себя (номер заказа у завода, трек)" rows={2} value={privateNote} onChange={(e) => touch(setPrivateNote)(e.target.value)} />
          <Textarea label="Заметка для покупателей (необязательно)" rows={2} maxLength={1000} value={publicNote} onChange={(e) => touch(setPublicNote)(e.target.value)} />

          {/* срок */}
          <div className="flex flex-col gap-2">
            <span className="field-label">Срок</span>
            <SegmentedControl options={ETA_MODES} value={etaMode} onChange={touch(setEtaMode)} />
            {etaMode === "DATE" && <Input aria-label="Дата" type="date" value={etaFrom} onChange={(e) => touch(setEtaFrom)(e.target.value)} />}
            {etaMode === "RANGE" && (
              <div className="grid gap-3 sm:grid-cols-2">
                <Input label="С" type="date" value={etaFrom} onChange={(e) => touch(setEtaFrom)(e.target.value)} />
                <Input label="По" type="date" value={etaTo} onChange={(e) => touch(setEtaTo)(e.target.value)} />
              </div>
            )}
            {etaMode === "APPROX" && (
              <Input
                label="Через сколько недель"
                inputMode="numeric"
                value={weeks}
                onChange={(e) => touch(setWeeks)(e.target.value.replace(/[^\d]/g, ""))}
                hint={`Дата-цель: ${fmtDay(approxDate)}. Покупатель увидит «~N тижнів» от сегодняшнего дня; когда дата пройдёт — «найближчим часом».`}
              />
            )}
            {etaMode === "HIDDEN" && <p className="text-[12px] text-[var(--text-faint)]">Покупатель срок не увидит. Менять его можно сколько угодно — рассылки не будет.</p>}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Как раздавать, когда приедет"
              value={distribution}
              options={DISTRIBUTIONS}
              onChange={(v) => touch(setDistribution)(v as Distribution)}
            />
            <Input label="Бронь, часов" inputMode="numeric" value={holdHours} onChange={(e) => touch(setHoldHours)(e.target.value.replace(/[^\d]/g, ""))} />
          </div>

          <Toggle
            checked={preorderOpen}
            onChange={touch(setPreorderOpen)}
            label="Открыть предзаказ (покупатели могут встать в очередь на эту поставку)"
          />

          {money && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Select label="Валюта закупки" value={currency} options={CURRENCIES.map((c) => ({ value: c, label: c }))} onChange={touch(setCurrency)} />
              <Input label="Курс к гривне" inputMode="decimal" value={fxRate} onChange={(e) => touch(setFxRate)(e.target.value)} placeholder="напр. 41.5" hint="Сколько ₴ за 1 единицу валюты." />
            </div>
          )}

          {/* позиции */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <span className="field-label">Позиции</span>
              {!itemsLocked && (
                <Button size="sm" variant="outline" icon={<Plus className="h-4 w-4" />} onClick={() => setPick(true)}>
                  Добавить товар
                </Button>
              )}
            </div>
            {itemsLocked && <p className="text-[12px] text-[var(--text-faint)]">Позиции можно менять, пока поставка не приехала.</p>}
            {lines.length === 0 && <p className="card-2 p-3 text-[13px] text-[var(--text-faint)]">Пока пусто.</p>}
            {lines.map((l) => (
              <div key={l.key} className="card-2 flex min-w-0 flex-wrap items-center gap-3 p-2">
                <Image src={l.imageUrl} alt={l.title} size={96} className="h-11 w-11 shrink-0 rounded-[var(--r-sm)] border border-[var(--line)]" />
                <div className="min-w-0 flex-1 basis-44 text-[13.5px] font-semibold leading-snug text-[var(--text)]">
                  <span className="line-clamp-2 break-words">{lineTitle(l.title, l.variantName)}</span>
                </div>
                <div className="w-24">
                  <Input
                    aria-label="Заказано, шт"
                    inputMode="numeric"
                    disabled={itemsLocked}
                    value={l.qty}
                    onChange={(e) => {
                      const v = e.target.value.replace(/[^\d]/g, "");
                      setLines((ls) => ls.map((x) => (x.key === l.key ? { ...x, qty: v } : x)));
                      setDirty(true);
                    }}
                    rightSlot={<span className="text-[11px] text-[var(--text-faint)]">шт</span>}
                  />
                </div>
                {money && (
                  <div className="w-36">
                    <Input
                      aria-label={`Цена закупки за шт, ${currency}`}
                      inputMode="decimal"
                      disabled={itemsLocked}
                      placeholder="цена"
                      value={l.price}
                      onChange={(e) => {
                        const v = e.target.value;
                        setLines((ls) => ls.map((x) => (x.key === l.key ? { ...x, price: v } : x)));
                        setDirty(true);
                      }}
                      rightSlot={<span className="text-[11px] text-[var(--text-faint)]">{currency}</span>}
                    />
                  </div>
                )}
                {!itemsLocked && (
                  <button
                    type="button"
                    aria-label="Убрать позицию"
                    onClick={() => {
                      setLines((ls) => ls.filter((x) => x.key !== l.key));
                      setDirty(true);
                    }}
                    className="grid h-9 w-9 place-items-center rounded-[var(--r-md)] text-[var(--text-muted)] hover:bg-[var(--surface-3)] hover:text-[var(--danger-ink)]"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </Modal>

      <ProductPickModal open={pick} title="Товар в поставку" onClose={() => setPick(false)} onPick={onPick} />

      <Modal open={!!variantsOf} onClose={() => setVariantsOf(null)} size="sm" title="Какой вариант?">
        <div className="flex flex-col gap-1.5">
          {variantsOf?.variants?.map((v) => {
            const added = lines.some((l) => l.productId === variantsOf.id && l.variantId === (v.id ?? null));
            return (
              <button
                key={v.id ?? v.name}
                type="button"
                disabled={added}
                onClick={() => addLine(variantsOf, v.id ?? null, v.name)}
                className="card-2 flex items-center justify-between gap-2 p-3 text-left text-[14px] hover:border-[var(--line-strong)] disabled:opacity-50"
              >
                <span className="font-semibold text-[var(--text)]">{v.name}</span>
                <span className="tabular text-[12px] text-[var(--text-faint)]">{added ? "добавлен" : `${v.stock} шт`}</span>
              </button>
            );
          })}
          <Button variant="accent" className="mt-2" onClick={() => setVariantsOf(null)}>
            Готово
          </Button>
        </div>
      </Modal>

      <SupplierModal
        open={supplierModal}
        onClose={() => setSupplierModal(false)}
        onCreated={(s) => {
          setSupplierId(String(s.id));
          setDirty(true);
        }}
      />
    </>
  );
}
