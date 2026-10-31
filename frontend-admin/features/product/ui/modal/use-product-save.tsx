"use client";

import type { CardStatus } from "@shop/core/catalog";
import { ApiError, errorMessage } from "@shop/core/errors";
import { toast } from "@shop/ui/toast";
import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { plural } from "@/features/catalog";
import {
  createBody,
  createErrors,
  editBody,
  firstCreateError,
  isCompareAtInvalid,
  stockDrop,
  stockRaises,
  type ProductForm,
} from "../../model/form";
import { S } from "../../model/steps";
import type { AdminProduct, AdminProductSaved, ProductWriteRequest } from "../../model/types";
import {
  fetchFreshProduct,
  isDoubleSubmit,
  uploadProductPhoto,
  useCreateProduct,
  useSetCardStatus,
  useUpdateProduct,
} from "../../queries";
import { offerRelease } from "../../release-offer";
import { usePublishGate } from "../PublishGate";
import { useStockReason, type StockReason } from "./StockReasonDialog";
import type { ProductDerived } from "./use-product-derived";
import type { ProductFormState } from "./use-product-form";

interface Args {
  product: AdminProduct | null;
  form: ProductFormState;
  d: ProductDerived;
  onClose: () => void;
  onSaved: () => void;
  onCreated?: (p: AdminProduct) => void;
  onCompleteWithAi?: (productId: string) => void;
}

/** Сколько значений отбросил валидатор: тост «Сохранено, но отброшено N значений: …». */
function reportIssues(saved: AdminProductSaved, labelOf: (key: string) => string) {
  const issues = saved.specIssues ?? [];
  if (!issues.length) return;
  toast.error(
    `Сохранено, но отброшено ${issues.length} ${plural(issues.length, "значение", "значения", "значений")}: ${issues
      .slice(0, 3)
      .map((i) => `${labelOf(i.key)} — ${i.reason}`)
      .join("; ")}${issues.length > 3 ? "…" : ""}`
  );
}

/** Фото: загрузка файлов в форму и перестановка (порядок живёт в форме и сохраняется кнопкой «Сохранить»). */
function usePhotos(form: ProductFormState) {
  const [uploading, setUploading] = useState(false);
  const { setF } = form;

  function moveImage(from: number, to: number) {
    setF((p) => {
      if (to < 0 || to >= p.imageKeys.length) return p;
      const next = [...p.imageKeys];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return { ...p, imageKeys: next };
    });
  }

  async function uploadFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const { key } = await uploadProductPhoto(file);
        setF((p) => ({ ...p, imageKeys: [...p.imageKeys, key] }));
      }
    } catch (e) {
      toast.error(errorMessage(e, undefined, "Ошибка загрузки"));
    } finally {
      setUploading(false);
    }
  }

  return { uploading, moveImage, uploadFiles };
}

/** Сохранение окна товара: создание, правка (шлюз публикации, причина списания, конфликт остатков), статус карточки. */
export function useProductSave({ product, form, d, onClose, onSaved, onCreated, onCompleteWithAi }: Args) {
  const qc = useQueryClient();
  const { f, setF, go, baseStockRef, setCardStatus, setShowMissing } = form;
  const photos = usePhotos(form);
  const [saving, setSaving] = useState(false);
  // Почему уменьшили остаток (спрашивается при сохранении); уходит с каждым телом этого сохранения.
  const stockReasonRef = useRef<StockReason | null>(null);
  const [askStockReason, stockReasonUi] = useStockReason();
  const updateM = useUpdateProduct();
  const createM = useCreateProduct();
  const cardStatusM = useSetCardStatus();

  const buildBody = (overrides: Partial<ProductWriteRequest> = {}) =>
    editBody(f, { base: baseStockRef.current, attrKeys: d.schemaQ.data && f.categoryId ? d.attrKeys : null, stockReason: stockReasonRef.current }, overrides);
  const labelOf = (k: string) => d.attrs.find((a) => a.key === k)?.labelRu ?? k;

  const [guard, gateUi] = usePublishGate(async (id) => {
    // «Оформить с ИИ»: оставить правки (скрытым) и передать оформлению с ИИ.
    try {
      const saved = await updateM.mutateAsync({ id, body: buildBody({ active: false }) });
      reportIssues(saved, labelOf);
      onSaved();
      onClose();
      onCompleteWithAi?.(id);
    } catch (e) {
      if (!isDoubleSubmit(e)) toast.error(errorMessage(e, undefined, "Не удалось сохранить"));
    }
  });

  const errors = createErrors(f, d.categoryIsLeaf);

  async function saveCreate() {
    const invalid = firstCreateError(errors);
    if (invalid) {
      setShowMissing(true);
      toast.error(invalid);
      return;
    }
    setSaving(true);
    try {
      const saved = await createM.mutateAsync(createBody(f));
      onSaved();
      onClose();
      onCreated?.(saved);
    } catch {
      // ошибку уже показал тост мутации
    } finally {
      setSaving(false);
    }
  }

  /** После 409: подтянуть актуальный остаток в форму (и в базу сверки) — остальные правки остаются как набраны. */
  async function refreshStock(id: string, message: string) {
    try {
      const fresh = await fetchFreshProduct(id);
      if (!fresh) throw new Error("gone");
      const freshVariants: Record<string, number> = Object.fromEntries(
        (fresh.variants ?? []).filter((v) => v.id).map((v) => [v.id as string, v.stock])
      );
      setF((p: ProductForm) => ({
        ...p,
        stock: String(fresh.stock ?? 0),
        variants: p.variants.map((v) => (v.id && freshVariants[v.id] !== undefined ? { ...v, stock: freshVariants[v.id] } : v)),
      }));
      baseStockRef.current = { stock: fresh.stock ?? 0, variants: freshVariants };
      go(S.pricing);
      toast.error(`${message}. В форме теперь актуальный остаток — проверьте и сохраните ещё раз.`);
    } catch {
      toast.error(message);
    }
  }

  /** Правка не пускает дальше, пока что-то не так: вернёт шаг, на который надо перейти. */
  function failedStep(): { step: number; message: string } | null {
    if (!f.title.trim()) return { step: S.basics, message: "Укажите название" };
    if (isCompareAtInvalid(f)) return { step: S.pricing, message: "Старая цена должна быть больше текущей" };
    if (!d.categoryIsLeaf) return { step: S.category, message: "Товар кладётся в категорию без подкатегорий" };
    return null;
  }

  /** Уменьшение остатка требует причины (она уйдёт в «Списания»); отмена окна отменяет и сохранение. */
  async function askReasonIfLowered(): Promise<boolean> {
    stockReasonRef.current = null;
    const drop = stockDrop(f, baseStockRef.current);
    if (drop > 0) {
      const r = await askStockReason(drop);
      if (!r) return false;
      stockReasonRef.current = r;
    }
    return true;
  }

  async function saveEdit(p: AdminProduct) {
    const failed = failedStep();
    if (failed) {
      toast.error(failed.message);
      go(failed.step);
      return;
    }
    if (!(await askReasonIfLowered())) return;
    const raised = stockRaises(f, baseStockRef.current);
    setSaving(true);
    try {
      const turningOn = f.active && p.active === false;
      let saved: AdminProductSaved | null = null;
      const send = async (force: boolean) => {
        saved = await updateM.mutateAsync({ id: p.id, body: buildBody(), force });
      };
      const ok = turningOn ? await guard(p, send) : (await send(false), true);
      if (!ok || !saved) return;
      reportIssues(saved, labelOf);
      toast.success("Сохранено");
      void offerRelease(qc, p.id, raised);
      onSaved();
      onClose();
    } catch (e) {
      if (e instanceof ApiError && e.code === "STOCK_CONFLICT") await refreshStock(p.id, e.message);
      else if (!isDoubleSubmit(e)) toast.error(errorMessage(e, undefined, "Не удалось сохранить"));
    } finally {
      setSaving(false);
    }
  }

  const save = () => (product ? saveEdit(product) : saveCreate());

  async function changeCardStatus(status: CardStatus) {
    if (!product) return;
    try {
      await cardStatusM.mutateAsync({ id: product.id, status });
      setCardStatus(status);
    } catch {
      // ошибку уже показал тост мутации
    }
  }

  return {
    ...photos,
    saving,
    save,
    saveCreate,
    errors,
    changeCardStatus,
    statusBusy: cardStatusM.isPending,
    overlays: (
      <>
        {gateUi}
        {stockReasonUi}
      </>
    ),
  };
}
export type ProductSave = ReturnType<typeof useProductSave>;
