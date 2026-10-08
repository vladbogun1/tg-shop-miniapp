"use client";

/**
 * ProductModal (ChiSetup v3).
 *
 * CREATE — a short form: only the title is required; photos, and (under «Ещё») price and stock
 * are optional. The backend saves the product hidden with a DRAFT card; the products page then
 * opens CardCompletionModal right away («Оформить с ИИ»).
 *
 * EDIT — the stepped wizard: 1) Основное → 2) Фото → 3) Цена и склад → 4) Категория (leaf category,
 * brand, condition, «На витрине») → 5) Характеристики (form from the category schema, AI confidence,
 * card status) → 6) Сайт (slug, SEO, SKU) → 7) Проверка. «Сохранить» works from every step;
 * closing with unsaved changes asks first.
 * Stock is sent only when the admin changed it, together with the value the form was opened with
 * (expectedStock) — the server answers 409 STOCK_CONFLICT if orders moved it meanwhile.
 * Turning «На витрине» on for a DRAFT card goes through the publishing gate (PublishGate).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  ExternalLink,
  Plus,
  RotateCcw,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  UploadCloud,
  Wand2,
  X,
} from "lucide-react";
import {
  adminApi,
  ApiError,
  type AdminProduct,
  type AdminProductSaved,
  type CardStatus,
  type ProductCondition,
  type ProductSpecs,
  type ProductVariant,
  type ProductWriteRequest,
} from "@/lib/api";
import { guessProductBrand } from "@shop/shared";
import {
  attributesForCategory,
  CARD_STATUS_LABEL,
  CONDITION_LABEL,
  CONDITION_OPTIONS,
  formatAdminSpec,
  isLeaf,
  isSpecEmpty,
  missingRequiredKeys,
  pathLabel,
  plural,
} from "@/lib/catalog-admin";
import { slugify } from "@/lib/slug";
import { money, toMajor, toMinor } from "@/lib/money";
import { Image } from "@/lib/image";
import { cn } from "@/lib/cn";
import { useToast } from "@/lib/toast";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Toggle } from "@/components/ui/Toggle";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Spinner } from "@/components/ui/Spinner";
import { CategoryTreeSelect } from "@/components/catalog/CategoryTreeSelect";
import { BrandCombobox, type BrandValue } from "@/components/catalog/BrandCombobox";
import { SpecsForm } from "@/components/catalog/SpecsForm";
import { CardStatusBadge } from "@/components/catalog/CardBits";
import { usePublishGate } from "@/components/catalog/PublishGate";

interface Props {
  open: boolean;
  product: AdminProduct | null; // null = create
  onClose: () => void;
  onSaved: () => void;
  /** Create mode: the new (hidden, DRAFT) product — the page opens the AI completion for it. */
  onCreated?: (p: AdminProduct) => void;
  /** «Оформить с ИИ» from the publishing gate. */
  onCompleteWithAi?: (productId: string) => void;
}

/** The editable form as plain values — the same shape is snapshotted to detect unsaved changes. */
function initialForm(product: AdminProduct | null) {
  return {
    title: product?.title ?? "",
    description: product?.description ?? "",
    priceMajor: product && product.priceMinor > 0 ? String(toMajor(product.priceMinor)) : "",
    stock: String(product?.stock ?? 0),
    active: product?.active ?? false,
    slug: product?.slug ?? "",
    compareAtMajor: product?.compareAtMinor ? String(toMajor(product.compareAtMinor)) : "",
    seoTitle: product?.seoTitle ?? "",
    seoDescription: product?.seoDescription ?? "",
    sku: product?.sku ?? "",
    categoryId: product?.categoryId ?? "",
    brand: { id: product?.brandRef?.id ?? null, name: product?.brandRef?.name ?? "" } as BrandValue,
    condition: (product?.condition ?? "NEW") as ProductCondition,
    conditionNote: product?.conditionNote ?? "",
    specs: (product?.specs ?? {}) as ProductSpecs,
    // Keep the id: it is what tells the server "this is the same variant", so renaming one edits
    // the existing row instead of deleting it and minting a new UUID (which broke customers'
    // saved carts and the variant reference on past orders).
    variants: (product?.variants?.map((v) => ({ id: v.id, name: v.name, stock: v.stock })) ?? []) as ProductVariant[],
    imageKeys:
      product?.images
        ?.slice()
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
        .map((i) => i.url ?? "")
        .filter(Boolean) ?? [],
  };
}

type Form = ReturnType<typeof initialForm>;

/** Field names of content_translations whose Russian source the form can change. */
const PRODUCT_TR_FIELDS = ["title", "description", "seo_title", "seo_description", "condition_note"] as const;

const STEPS = [
  { key: "basics", label: "Основное" },
  { key: "photos", label: "Фото" },
  { key: "pricing", label: "Цена и склад" },
  { key: "category", label: "Категория" },
  { key: "specs", label: "Характеристики" },
  { key: "site", label: "Сайт" },
  { key: "review", label: "Проверка" },
] as const;
const S = { basics: 0, photos: 1, pricing: 2, category: 3, specs: 4, site: 5, review: 6 } as const;

/** Step slide animation (direction-aware via the `custom` prop = dir). */
const STEP_ANIM = {
  enter: (d: number) => ({ opacity: 0, x: d * 28 }),
  center: { opacity: 1, x: 0 },
  exit: (d: number) => ({ opacity: 0, x: d * -28 }),
};

export function ProductModal({ open, product, onClose, onSaved, onCreated, onCompleteWithAi }: Props) {
  const { push } = useToast();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const creating = !product;

  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [f, setF] = useState<Form>(() => initialForm(product));
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [cardStatus, setCardStatus] = useState<CardStatus>("DRAFT");
  const [statusBusy, setStatusBusy] = useState(false);
  const [showMissing, setShowMissing] = useState(false);
  // Currency is hryvnia only; the free-text field let a typo ("UHA") through.
  const currency = "UAH";

  // What the form was opened with: the dirty check compares against it, and the stock values are
  // the `expectedStock` the server verifies (replaced with fresh numbers after a 409).
  const [initialSnapshot, setInitialSnapshot] = useState("");
  const baseStockRef = useRef<{ stock: number; variants: Record<string, number> }>({ stock: 0, variants: {} });
  const resetKey = `${open}-${product?.id ?? "new"}-${f.categoryId}`;

  useEffect(() => {
    if (!open) return;
    const fresh = initialForm(product);
    setStep(0);
    setDir(1);
    setConfirmClose(false);
    setShowMissing(false);
    setF(fresh);
    setCardStatus(product?.cardStatus ?? "DRAFT");
    setInitialSnapshot(JSON.stringify(fresh));
    baseStockRef.current = {
      stock: Number(fresh.stock) || 0,
      variants: Object.fromEntries(fresh.variants.filter((v) => v.id).map((v) => [v.id as string, Number(v.stock) || 0])),
    };
  }, [open, product]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v }));
  const dirty = open && JSON.stringify(f) !== initialSnapshot;

  // ---- catalog data ----
  const catsQ = useQuery({ queryKey: ["categories"], queryFn: adminApi.categories, enabled: open, staleTime: 60_000 });
  const brandsQ = useQuery({ queryKey: ["brands"], queryFn: adminApi.brands, enabled: open, staleTime: 60_000 });
  const schemaQ = useQuery({ queryKey: ["catalog-schema"], queryFn: adminApi.catalogSchema, enabled: open, staleTime: 60_000 });
  const categories = useMemo(() => catsQ.data ?? schemaQ.data?.categories ?? [], [catsQ.data, schemaQ.data]);
  const brands = brandsQ.data ?? [];
  const attrs = useMemo(
    () => (schemaQ.data && f.categoryId ? attributesForCategory(schemaQ.data.attributes, categories, f.categoryId) : []),
    [schemaQ.data, categories, f.categoryId]
  );
  const attrKeys = useMemo(() => new Set(attrs.map((a) => a.key)), [attrs]);
  // Values whose key is not in the selected category's schema are dropped on save.
  const droppedKeys = useMemo(
    () => (schemaQ.data && f.categoryId ? Object.keys(f.specs).filter((k) => !attrKeys.has(k)) : []),
    [schemaQ.data, f.categoryId, f.specs, attrKeys]
  );
  const missing = useMemo(() => missingRequiredKeys(attrs, f.specs), [attrs, f.specs]);
  const filledCount = attrs.filter((a) => !isSpecEmpty(f.specs[a.key])).length;
  const categoryIsLeaf = !f.categoryId || categories.length === 0 || isLeaf(categories, f.categoryId);

  /** Esc / × / «Отмена»: ask before throwing away a half-filled form. */
  function requestClose() {
    if (saving) return;
    if (dirty) setConfirmClose(true);
    else onClose();
  }

  // Translations a source edit will reset (uk/en of the changed fields go STALE on the site).
  const { data: translated } = useQuery({
    queryKey: ["translations", "translated-uk-en"],
    queryFn: async () => {
      const [uk, en] = await Promise.all([adminApi.translationsExport("uk", "translated"), adminApi.translationsExport("en", "translated")]);
      return [...uk, ...en];
    },
    enabled: open && !!product,
    staleTime: 60_000,
  });
  const staleAfterSave = useMemo(() => {
    if (!product || !translated) return 0;
    const changed = new Set<string>();
    if (f.title.trim() !== (product.title ?? "").trim()) changed.add("title");
    if (f.description.trim() !== (product.description ?? "").trim()) changed.add("description");
    if (f.seoTitle.trim() !== (product.seoTitle ?? "").trim()) changed.add("seo_title");
    if (f.seoDescription.trim() !== (product.seoDescription ?? "").trim()) changed.add("seo_description");
    if (f.conditionNote.trim() !== (product.conditionNote ?? "").trim()) changed.add("condition_note");
    const renamedVariants = new Set(
      f.variants
        .filter((v) => {
          const before = product.variants?.find((o) => o.id && o.id === v.id);
          return before && before.name.trim() !== v.name.trim();
        })
        .map((v) => v.id as string)
    );
    return translated.filter(
      (t) =>
        (t.entityType === "PRODUCT" &&
          t.entityId === product.id &&
          (PRODUCT_TR_FIELDS as readonly string[]).includes(t.field) &&
          changed.has(t.field)) ||
        (t.entityType === "VARIANT" && renamedVariants.has(t.entityId))
    ).length;
  }, [product, translated, f.title, f.description, f.seoTitle, f.seoDescription, f.conditionNote, f.variants]);

  const hasVariants = f.variants.length > 0;
  const effectiveStock = useMemo(
    () => (hasVariants ? f.variants.reduce((a, v) => a + (Number(v.stock) || 0), 0) : Number(f.stock) || 0),
    [hasVariants, f.variants, f.stock]
  );
  const priceMinor = f.priceMajor.trim() ? toMinor(f.priceMajor) : 0;
  const compareAtMinor = f.compareAtMajor.trim() ? toMinor(f.compareAtMajor) : 0;
  const compareAtInvalid = compareAtMinor > 0 && compareAtMinor <= priceMinor;
  const slugPreview = f.slug.trim() ? slugify(f.slug) : slugify(f.title);
  // A "Бренд: …" line or a known name in the texts — offered as a one-tap suggestion.
  const suggestedBrand = useMemo(
    () => (creating ? null : guessProductBrand({ title: f.title, description: f.description })),
    [creating, f.title, f.description]
  );

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
        const { key } = await adminApi.upload(file);
        setF((p) => ({ ...p, imageKeys: [...p.imageKeys, key] }));
      }
    } catch (e) {
      push(e instanceof ApiError ? e.message : "Ошибка загрузки", "error");
    } finally {
      setUploading(false);
    }
  }

  /** Per-step validity — gates the Next button (clicking the header can still jump). */
  function stepValid(i: number): boolean {
    if (i === S.basics) return f.title.trim().length > 0;
    if (i === S.pricing) return !compareAtInvalid && !(f.active && priceMinor <= 0);
    if (i === S.category) return categoryIsLeaf;
    return true;
  }

  function go(to: number) {
    if (to < 0 || to >= STEPS.length) return;
    setDir(to > step ? 1 : -1);
    setStep(to);
  }

  function next() {
    if (!stepValid(step)) {
      if (step === S.basics) push("Укажите название", "error");
      else if (step === S.pricing)
        push(compareAtInvalid ? "Старая цена должна быть больше текущей" : "Товару на витрине нужна цена больше 0", "error");
      else if (step === S.category) push("Выберите категорию без подкатегорий", "error");
      return;
    }
    go(step + 1);
  }

  // ---- save -----------------------------------------------------------------------------

  function editBody(overrides: Partial<ProductWriteRequest> = {}): ProductWriteRequest {
    const base = baseStockRef.current;
    const stockChanged = !hasVariants && (Number(f.stock) || 0) !== base.stock;
    // Only keys of the category's schema go out (the rest would be dropped by the server anyway).
    const specs = schemaQ.data && f.categoryId ? Object.fromEntries(Object.entries(f.specs).filter(([k]) => attrKeys.has(k))) : f.specs;
    return {
      title: f.title.trim(),
      description: f.description.trim() || undefined,
      priceMinor,
      currency,
      ...(stockChanged ? { stock: Number(f.stock) || 0, expectedStock: base.stock } : {}),
      active: f.active,
      imageKeys: f.imageKeys,
      variants: f.variants
        .filter((v) => v.name.trim())
        .map((v) => {
          const n = Number(v.stock) || 0;
          const was = v.id ? base.variants[v.id] : undefined;
          if (was === undefined) return { id: v.id, name: v.name.trim(), stock: n };
          return n === was ? { id: v.id, name: v.name.trim() } : { id: v.id, name: v.name.trim(), stock: n, expectedStock: was };
        }),
      // Blank slug = the server generates one from the title (and makes it unique).
      slug: f.slug.trim(),
      compareAtMinor,
      seoTitle: f.seoTitle.trim(),
      seoDescription: f.seoDescription.trim(),
      sku: f.sku.trim(),
      // "" clears (null would keep the stored value).
      categoryId: f.categoryId,
      ...(f.brand.id ? { brandId: f.brand.id } : f.brand.name.trim() ? { brandName: f.brand.name.trim() } : { brandId: "" }),
      condition: f.condition,
      conditionNote: f.condition === "NEW" ? "" : f.conditionNote.trim(),
      specs,
      ...overrides,
    };
  }

  function reportIssues(saved: AdminProductSaved) {
    const issues = saved.specIssues ?? [];
    if (!issues.length) return;
    const label = (k: string) => attrs.find((a) => a.key === k)?.labelRu ?? k;
    push(
      `Сохранено, но отброшено ${issues.length} ${plural(issues.length, "значение", "значения", "значений")}: ${issues
        .slice(0, 3)
        .map((i) => `${label(i.key)} — ${i.reason}`)
        .join("; ")}${issues.length > 3 ? "…" : ""}`,
      "error"
    );
  }

  const [guard, gateUi] = usePublishGate(async (id) => {
    // «Оформить с ИИ»: keep the edits (hidden), then hand over to the AI completion.
    try {
      const saved = await adminApi.updateProduct(id, editBody({ active: false }));
      reportIssues(saved);
      onSaved();
      onClose();
      onCompleteWithAi?.(id);
    } catch (e) {
      push(e instanceof ApiError ? e.message : "Не удалось сохранить", "error");
    }
  });

  const createErrors = {
    title: !f.title.trim() ? "Укажите название" : undefined,
    category: !f.categoryId ? "Выберите категорию" : !categoryIsLeaf ? "Выберите подкатегорию" : undefined,
    price: priceMinor <= 0 ? "Укажите цену больше 0" : undefined,
    stock: !hasVariants && f.stock.trim() === "" ? "Укажите остаток" : undefined,
    variants: f.variants.some((v) => !v.name.trim()) ? "У варианта нет названия" : undefined,
  };
  const createInvalid = Object.values(createErrors).find(Boolean);

  async function saveCreate() {
    if (createInvalid) {
      setShowMissing(true);
      push(createInvalid, "error");
      return;
    }
    setSaving(true);
    try {
      const saved = await adminApi.createProduct({
        title: f.title.trim(),
        priceMinor,
        currency,
        stock: effectiveStock,
        active: false,
        imageKeys: f.imageKeys,
        variants: f.variants.filter((v) => v.name.trim()).map((v) => ({ name: v.name.trim(), stock: Number(v.stock) || 0 })),
        categoryId: f.categoryId,
        ...(f.brand.id ? { brandId: f.brand.id } : f.brand.name.trim() ? { brandName: f.brand.name.trim() } : {}),
      });
      push("Товар создан — скрыт до оформления", "ok");
      onSaved();
      onClose();
      onCreated?.(saved);
    } catch (e) {
      push(e instanceof ApiError ? e.message : "Не удалось создать", "error");
    } finally {
      setSaving(false);
    }
  }

  async function save() {
    if (!product) return saveCreate();
    if (!f.title.trim()) {
      push("Укажите название", "error");
      go(S.basics);
      return;
    }
    if (compareAtInvalid) {
      push("Старая цена должна быть больше текущей", "error");
      go(S.pricing);
      return;
    }
    if (!categoryIsLeaf) {
      push("Товар кладётся в категорию без подкатегорий", "error");
      go(S.category);
      return;
    }
    setSaving(true);
    try {
      const turningOn = f.active && product.active === false;
      let saved: AdminProductSaved | null = null;
      const ok = turningOn
        ? await guard(product, async (force) => {
            saved = await adminApi.updateProduct(product.id, editBody(), force);
          })
        : ((saved = await adminApi.updateProduct(product.id, editBody())), true);
      if (!ok || !saved) return;
      reportIssues(saved);
      push("Сохранено", "ok");
      onSaved();
      onClose();
    } catch (e) {
      if (e instanceof ApiError && e.code === "STOCK_CONFLICT") {
        await refreshStock(product.id, e.message);
      } else {
        push(e instanceof ApiError ? e.message : "Не удалось сохранить", "error");
      }
    } finally {
      setSaving(false);
    }
  }

  /**
   * After a 409: pull the current stock into the form (and the baseline) and let the admin decide
   * again — the rest of their edits stay as typed.
   */
  async function refreshStock(id: string, message: string) {
    try {
      const fresh = (await adminApi.products()).find((x) => x.id === id);
      if (!fresh) throw new Error("gone");
      const freshVariants: Record<string, number> = Object.fromEntries(
        (fresh.variants ?? []).filter((v) => v.id).map((v) => [v.id as string, v.stock])
      );
      setF((p) => ({
        ...p,
        stock: String(fresh.stock ?? 0),
        variants: p.variants.map((v) => (v.id && freshVariants[v.id] !== undefined ? { ...v, stock: freshVariants[v.id] } : v)),
      }));
      baseStockRef.current = { stock: fresh.stock ?? 0, variants: freshVariants };
      go(S.pricing);
      push(`${message}. В форме теперь актуальный остаток — проверьте и сохраните ещё раз.`, "error");
    } catch {
      push(message, "error");
    }
  }

  async function changeCardStatus(status: CardStatus) {
    if (!product) return;
    setStatusBusy(true);
    try {
      await adminApi.setCardStatus(product.id, status);
      setCardStatus(status);
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["cards"] });
      push(status === "READY" ? "Карточка отмечена проверенной" : "Карточка возвращена в черновик", "ok");
    } catch (e) {
      push(e instanceof ApiError ? e.message : "Не удалось изменить статус", "error");
    } finally {
      setStatusBusy(false);
    }
  }

  function changeCategory(id: string) {
    setF((p) => ({ ...p, categoryId: id }));
  }

  const isLast = step === STEPS.length - 1;
  const slugChanged = !!product?.slug && slugPreview !== "" && slugPreview !== product.slug;
  const brandSuggestion =
    suggestedBrand && suggestedBrand.toLowerCase() !== f.brand.name.trim().toLowerCase()
      ? brands.find(
          (b) =>
            b.name.toLowerCase() === suggestedBrand.toLowerCase() ||
            b.aliases.some((a) => a.toLowerCase() === suggestedBrand.toLowerCase())
        ) ?? { id: null as string | null, name: suggestedBrand }
      : null;

  const closeConfirm = (
    <div className="flex w-full flex-wrap items-center justify-between gap-2">
      <span className="text-[13px] font-semibold text-[var(--text)]">Закрыть без сохранения? Изменения пропадут.</span>
      <div className="flex gap-2">
        <Button variant="ghost" onClick={() => setConfirmClose(false)}>
          Продолжить
        </Button>
        <Button
          variant="danger"
          onClick={() => {
            setConfirmClose(false);
            onClose();
          }}
        >
          Закрыть
        </Button>
      </div>
    </div>
  );

  // ---- create: one compact screen ---------------------------------------------------------------
  if (creating) {
    const err = (k: keyof typeof createErrors) => (showMissing ? createErrors[k] : undefined);
    return (
      <Modal
        open={open}
        onClose={requestClose}
        size="lg"
        closeOnBackdrop={false}
        title="Новый товар"
        footer={
          confirmClose ? (
            closeConfirm
          ) : (
            <div className="flex w-full items-center justify-between gap-2">
              <Button variant="ghost" onClick={requestClose}>
                Отмена
              </Button>
              <Button variant="accent" loading={saving} disabled={uploading} onClick={saveCreate} icon={<Wand2 className="h-4 w-4" />}>
                Создать и оформить с ИИ
              </Button>
            </div>
          )
        }
      >
        <div className="flex flex-col gap-4">
          <Input
            label="Название"
            autoFocus
            value={f.title}
            onChange={(e) => set("title", e.target.value)}
            placeholder="Напр. VGN Dragonfly F1 Moba"
            error={err("title")}
            hint="Как у производителя: бренд и модель — по ним ИИ найдёт характеристики."
          />
          <CategoryTreeSelect
            id="new-product-category"
            label="Категория"
            categories={categories}
            value={f.categoryId}
            onChange={changeCategory}
            mode="leaf"
            showCounts
            placeholder={catsQ.isLoading ? "Загрузка…" : categories.length ? "Выберите категорию" : "Категорий пока нет"}
            error={err("category") ?? (!categoryIsLeaf ? "У этой категории есть подкатегории — выберите одну из них" : undefined)}
            hint={categories.length === 0 && !catsQ.isLoading ? "Создайте категории в разделе «Категории»." : undefined}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Цена, ₴"
              inputMode="decimal"
              value={f.priceMajor}
              onChange={(e) => set("priceMajor", e.target.value)}
              placeholder="0"
              error={err("price")}
            />
            <Input
              label="Остаток"
              inputMode="numeric"
              value={hasVariants ? String(effectiveStock) : f.stock}
              disabled={hasVariants}
              onChange={(e) => set("stock", e.target.value.replace(/[^\d]/g, ""))}
              error={err("stock")}
              hint={hasVariants ? "= сумма остатков вариантов" : undefined}
            />
          </div>
          <Variants variants={f.variants} onChange={(v) => set("variants", v)} />
          {err("variants") && <p className="-mt-2 text-[12px] text-[var(--danger-ink)]">{err("variants")}</p>}
          <BrandCombobox
            brands={brands}
            value={f.brand}
            onChange={(v) => set("brand", v)}
            label="Бренд · необязательно"
            hint="Пусто — ИИ определит бренд по названию."
          />
          <PhotoUploader
            fileRef={fileRef}
            imageKeys={f.imageKeys}
            uploading={uploading}
            dragOver={dragOver}
            setDragOver={setDragOver}
            onFiles={uploadFiles}
            onRemove={(i) => set("imageKeys", f.imageKeys.filter((_, j) => j !== i))}
            onMove={moveImage}
            compact
          />
          <div className="flex items-start gap-2.5 rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] p-3 text-[12.5px] leading-relaxed text-[var(--text-muted)]">
            <Wand2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" />
            <span>
              Товар сохранится <b className="text-[var(--text)]">скрытым черновиком</b>, и сразу откроется оформление с ИИ: описание,
              характеристики и переводы названия и описания на украинский и английский — одним ответом.
            </span>
          </div>
        </div>
      </Modal>
    );
  }

  // ---- edit: the wizard -------------------------------------------------------------------------
  const pathText = f.categoryId ? pathLabel(categories, f.categoryId) : "";

  return (
    <>
      <Modal
        open={open}
        onClose={requestClose}
        size="lg"
        closeOnBackdrop={false}
        fixedHeight
        title="Редактировать товар"
        footer={
          confirmClose ? (
            closeConfirm
          ) : (
            <div className="flex w-full items-center justify-between gap-2">
              <Button variant="ghost" onClick={() => (step === 0 ? requestClose() : go(step - 1))} icon={step === 0 ? undefined : <ArrowLeft className="h-4 w-4" />}>
                {step === 0 ? "Отмена" : "Назад"}
              </Button>
              <div className="flex items-center gap-2">
                {/* Save from any step — a price fix should not mean clicking through seven. */}
                {!isLast && (
                  <Button variant="surface" loading={saving} disabled={!dirty} onClick={save} icon={<Check className="h-4 w-4" />}>
                    Сохранить
                  </Button>
                )}
                {isLast ? (
                  <Button variant="accent" loading={saving} onClick={save} icon={<Check className="h-4 w-4" />}>
                    Сохранить
                  </Button>
                ) : (
                  <Button variant="accent" onClick={next} icon={<ArrowRight className="h-4 w-4" />}>
                    Далее
                  </Button>
                )}
              </div>
            </div>
          )
        }
      >
        <Stepper step={step} onJump={go} />

        {staleAfterSave > 0 && (
          <Warning>
            Правка текстов сбросит переводы uk/en ({staleAfterSave} {plural(staleAfterSave, "поле", "поля", "полей")}) — на сайте снова
            будет русский текст, пока не переведёте заново в{" "}
            <Link href="/translations" className="font-semibold text-[var(--accent-hi)] hover:underline">
              «Переводах»
            </Link>
            .
          </Warning>
        )}
        {slugChanged && (step === S.site || step === S.review) && (
          <Warning>
            Смена адреса страницы сломает старые ссылки: <span className="font-mono">/product/{product?.slug}</span> перестанет открываться
            (поиск, закладки, рассылки).
          </Warning>
        )}

        {/* -m-1 p-1: room for the 3px focus ring inside the clip used by the slide animation. */}
        <div className="relative -m-1 mt-4 overflow-hidden p-1">
          <AnimatePresence mode="wait" custom={dir} initial={false}>
            <motion.div
              key={step}
              custom={dir}
              variants={STEP_ANIM}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            >
              {step === S.basics && (
                <div className="flex flex-col gap-4">
                  <Input label="Название" value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="Напр. Клавиатура Ajazz AF68" />
                  <Textarea
                    label="Описание"
                    rows={7}
                    value={f.description}
                    onChange={(e) => set("description", e.target.value)}
                    placeholder="1–3 абзаца: что это и для кого, важные оговорки. Характеристики — на шаге «Характеристики»."
                  />
                </div>
              )}

              {step === S.photos && (
                <PhotoUploader
                  fileRef={fileRef}
                  imageKeys={f.imageKeys}
                  uploading={uploading}
                  dragOver={dragOver}
                  setDragOver={setDragOver}
                  onFiles={uploadFiles}
                  onRemove={(i) => set("imageKeys", f.imageKeys.filter((_, j) => j !== i))}
                  onMove={moveImage}
                />
              )}

              {step === S.pricing && (
                <div className="flex flex-col gap-4">
                  <Input
                    label="Цена, ₴"
                    inputMode="decimal"
                    value={f.priceMajor}
                    onChange={(e) => set("priceMajor", e.target.value)}
                    placeholder="0"
                    error={f.active && priceMinor <= 0 ? "Товару на витрине нужна цена" : undefined}
                  />
                  <Input
                    label="Старая цена, ₴"
                    inputMode="decimal"
                    value={f.compareAtMajor}
                    onChange={(e) => set("compareAtMajor", e.target.value)}
                    placeholder="не задана"
                    error={compareAtInvalid ? "Должна быть больше текущей цены" : undefined}
                    hint={compareAtInvalid ? undefined : "Зачёркнутая цена на сайте. Пусто или 0 — не показывать."}
                  />
                  <Input
                    label="Остаток"
                    inputMode="numeric"
                    value={hasVariants ? String(effectiveStock) : f.stock}
                    disabled={hasVariants}
                    hint={hasVariants ? "= сумма остатков вариантов" : undefined}
                    onChange={(e) => set("stock", e.target.value)}
                  />
                  <Variants variants={f.variants} onChange={(v) => set("variants", v)} />
                </div>
              )}

              {step === S.category && (
                <div className="flex flex-col gap-4">
                  {catsQ.isLoading ? (
                    <div className="grid place-items-center py-8">
                      <Spinner />
                    </div>
                  ) : (
                    <>
                      <CategoryTreeSelect
                        id="product-category"
                        label="Категория"
                        categories={categories}
                        value={f.categoryId}
                        onChange={changeCategory}
                        mode="leaf"
                        showCounts
                        placeholder={categories.length ? "Выберите категорию" : "Категорий пока нет"}
                        error={!categoryIsLeaf ? "У этой категории есть подкатегории — выберите одну из них" : undefined}
                        hint={
                          categories.length === 0
                            ? "Создайте категории в разделе «Категории»."
                            : "Только категория без подкатегорий. От неё зависят характеристики и фильтры."
                        }
                      />
                      {!f.categoryId && (
                        <p className="-mt-2 text-[12.5px] text-[var(--warn)]">Без категории товар не попадёт в каталог сайта и фильтры.</p>
                      )}
                      {droppedKeys.length > 0 && (
                        <Warning compact>
                          В новой категории нет {droppedKeys.length} {plural(droppedKeys.length, "характеристики", "характеристик", "характеристик")} (
                          <span className="font-mono text-[12px]">{droppedKeys.slice(0, 5).join(", ")}</span>
                          {droppedKeys.length > 5 ? "…" : ""}) — при сохранении их значения будут удалены.
                        </Warning>
                      )}
                      <div>
                        <BrandCombobox
                          brands={brands}
                          value={f.brand}
                          onChange={(v) => set("brand", v)}
                          hint="Справочник — в «Брендах». Новый бренд создастся при сохранении."
                        />
                        {brandSuggestion && !f.brand.name && (
                          <button
                            type="button"
                            onClick={() => set("brand", { id: brandSuggestion.id, name: brandSuggestion.name })}
                            className="nb-chip nb-press focusable mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 text-[12px] text-[var(--text-muted)] hover:text-[var(--text)]"
                          >
                            <Sparkles className="h-3.5 w-3.5 text-[var(--accent)]" />
                            Предложить: {brandSuggestion.name}
                            {!brandSuggestion.id && <span className="text-[var(--text-faint)]">(новый)</span>}
                          </button>
                        )}
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <span className="field-label">Состояние</span>
                        <SegmentedControl<ProductCondition>
                          className="self-start"
                          options={CONDITION_OPTIONS}
                          value={f.condition}
                          onChange={(v) => set("condition", v)}
                        />
                        <AnimatePresence initial={false}>
                          {f.condition !== "NEW" && (
                            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                              <div className="pt-2">
                                <Input
                                  label={f.condition === "MARKDOWN" ? "Причина уценки" : "Состояние товара"}
                                  value={f.conditionNote}
                                  maxLength={255}
                                  onChange={(e) => set("conditionNote", e.target.value)}
                                  placeholder={f.condition === "MARKDOWN" ? "Вскрыта упаковка, полный комплект" : "Был в использовании 2 месяца, без дефектов"}
                                  hint="Видна покупателю на плашке товара. Перевод — во вкладке «Переводы». Товар попадёт в подборку «Уценка»."
                                />
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                      <div className="rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] p-3">
                        <Toggle checked={f.active} onChange={(v) => set("active", v)} label="На витрине (виден в каталоге)" />
                        {f.active && product?.active === false && cardStatus === "DRAFT" && (
                          <p className="mt-2 pl-14 text-[12px] text-[var(--text-faint)]">Карточка не оформлена — при сохранении спросим, выкладывать ли.</p>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}

              {step === S.specs && (
                <div className="flex flex-col gap-4">
                  {!f.categoryId ? (
                    <EmptyStep
                      text="Сначала выберите категорию — форма характеристик строится по её схеме."
                      action={
                        <Button size="sm" variant="surface" onClick={() => go(S.category)}>
                          К категории
                        </Button>
                      }
                    />
                  ) : schemaQ.isLoading ? (
                    <div className="grid place-items-center py-10">
                      <Spinner />
                    </div>
                  ) : schemaQ.isError ? (
                    <EmptyStep
                      text="Не удалось загрузить схему характеристик."
                      action={
                        <Button size="sm" variant="surface" onClick={() => schemaQ.refetch()}>
                          Повторить
                        </Button>
                      }
                    />
                  ) : attrs.length === 0 ? (
                    <EmptyStep
                      text={`У категории «${pathText}» пока нет характеристик.`}
                      action={
                        <Link href={`/categories?edit=${f.categoryId}`} className="text-[13px] font-semibold text-[var(--accent-hi)] hover:underline">
                          Добавить в «Категориях»
                        </Link>
                      }
                    />
                  ) : (
                    <>
                      <div className="flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-[var(--text-muted)]">
                        <span className="min-w-0 truncate">{pathText}</span>
                        <span className="tabular">
                          заполнено {filledCount} из {attrs.length}
                          {missing.length > 0 && (
                            <button type="button" onClick={() => setShowMissing((v) => !v)} className="ml-2 font-semibold text-[var(--warn)] hover:underline">
                              обязательных нет: {missing.length}
                            </button>
                          )}
                        </span>
                      </div>
                      <SpecsForm
                        attrs={attrs}
                        groups={schemaQ.data?.groups ?? []}
                        specs={f.specs}
                        onChange={(s) => set("specs", s)}
                        meta={product?.cardMeta}
                        resetKey={resetKey}
                        highlightMissing={showMissing}
                      />
                    </>
                  )}
                  <CardStatusPanel
                    status={cardStatus}
                    confidence={product?.cardConfidence}
                    missing={missing.length}
                    sources={product?.cardMeta?.sources ?? []}
                    notes={product?.cardMeta?.notes}
                    busy={statusBusy}
                    onReady={() => changeCardStatus("READY")}
                    onDraft={() => changeCardStatus("DRAFT")}
                    onAi={onCompleteWithAi && product ? () => (onClose(), onCompleteWithAi(product.id)) : undefined}
                    dirty={dirty}
                  />
                </div>
              )}

              {step === S.site && (
                <div className="flex flex-col gap-4">
                  <Input
                    label="Адрес страницы (slug)"
                    value={f.slug}
                    onChange={(e) => set("slug", e.target.value)}
                    placeholder={slugify(f.title) || "из названия"}
                    hint={f.slug.trim() ? `Страница: /product/${slugPreview || "…"}` : `Пусто — сгенерируется из названия: /product/${slugPreview || "…"}`}
                  />
                  <Input
                    label="SEO-заголовок"
                    value={f.seoTitle}
                    maxLength={255}
                    onChange={(e) => set("seoTitle", e.target.value)}
                    placeholder={f.title || "по умолчанию — название"}
                    hint="Заголовок вкладки и поисковой выдачи. Пусто — шаблон сайта: «название — тип товара, купить в Украине»."
                  />
                  <Textarea
                    label="SEO-описание"
                    rows={3}
                    maxLength={512}
                    value={f.seoDescription}
                    onChange={(e) => set("seoDescription", e.target.value)}
                    placeholder="Пусто — начало описания товара"
                    hint={`${f.seoDescription.length}/512 · сниппет в поиске и превью ссылки`}
                  />
                  <Input
                    label="Артикул (SKU)"
                    value={f.sku}
                    maxLength={64}
                    onChange={(e) => set("sku", e.target.value)}
                    placeholder="необязательно"
                    hint="Уникальный у каждого товара. Пусто — в разметке будет id товара."
                  />
                </div>
              )}

              {step === S.review && (
                <Review
                  f={f}
                  priceLabel={priceMinor > 0 ? money(priceMinor, currency) : "—"}
                  compareAtLabel={compareAtMinor > priceMinor ? money(compareAtMinor, currency) : null}
                  slug={slugPreview}
                  stock={effectiveStock}
                  hasVariants={hasVariants}
                  categoryPath={pathText}
                  specsSummary={attrs
                    .map((a) => {
                      const t = formatAdminSpec(a, f.specs[a.key]);
                      return t ? { label: a.labelRu, text: t } : null;
                    })
                    .filter((x): x is { label: string; text: string } => !!x)}
                  missing={missing.length}
                  cardStatus={cardStatus}
                  confidence={product?.cardConfidence}
                  onEdit={go}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </Modal>
      {gateUi}
    </>
  );
}

// ---- pieces ---------------------------------------------------------------------------------------

function PhotoUploader({
  fileRef,
  imageKeys,
  uploading,
  dragOver,
  setDragOver,
  onFiles,
  onRemove,
  onMove,
  compact,
}: {
  fileRef: React.RefObject<HTMLInputElement | null>;
  imageKeys: string[];
  uploading: boolean;
  dragOver: boolean;
  setDragOver: (v: boolean) => void;
  onFiles: (f: FileList | null) => void;
  onRemove: (i: number) => void;
  onMove: (from: number, to: number) => void;
  compact?: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      {compact && <span className="field-label">Фото · необязательно</span>}
      <div
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            fileRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          onFiles(e.dataTransfer.files);
        }}
        onClick={() => fileRef.current?.click()}
        className={cn(
          "focusable font-display flex cursor-pointer flex-col items-center justify-center gap-2.5 rounded-[var(--r-lg)] border px-4 text-center text-[12.5px] font-semibold uppercase tracking-[0.06em] transition-colors",
          compact ? "py-5" : "py-7",
          dragOver
            ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-hi)]"
            : "border-[var(--line)] bg-[var(--bg-2)] text-[var(--text-muted)] hover:border-[var(--border-2)] hover:text-[var(--text)]"
        )}
      >
        <span className="accent-tint grid h-11 w-11 place-items-center rounded-[var(--r-md)]">
          {uploading ? <Spinner className="h-5 w-5" /> : <UploadCloud className="h-5 w-5" />}
        </span>
        {uploading ? "Загрузка…" : "Перетащите фото или нажмите для загрузки"}
        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => onFiles(e.target.files)} />
      </div>
      {imageKeys.length === 0 ? (
        !compact && <p className="text-[13px] text-[var(--text-faint)]">Первое фото станет обложкой. Порядок можно менять стрелками.</p>
      ) : (
        <>
          <p className="field-label !text-[11px] !text-[var(--text-faint)]">{imageKeys.length} фото · первое = обложка</p>
          <div className={cn("grid gap-2", compact ? "grid-cols-4 sm:grid-cols-5" : "grid-cols-3 sm:grid-cols-4")}>
            {imageKeys.map((key, i) => (
              // One clipping frame (r-lg): the photo, the overlays and the arrow strip all live inside it.
              <motion.div
                layout
                key={key + i}
                className={cn("group relative overflow-hidden rounded-[var(--r-lg)] border", i === 0 ? "border-[rgba(255,102,0,.45)]" : "border-[var(--line)]")}
              >
                <Image src={key} alt="" size={200} className="aspect-square w-full" />
                {i === 0 && (
                  <span className="font-display absolute left-1.5 top-1.5 rounded-[var(--r-md)] border border-[rgba(255,102,0,.45)] bg-[rgba(14,14,16,.8)] px-1.5 py-0.5 text-[10px] font-semibold uppercase leading-[14px] tracking-[0.06em] text-[var(--accent-hi)] backdrop-blur-sm">
                    обложка
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => onRemove(i)}
                  className="hit absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-[var(--r-md)] border border-[var(--line-strong)] bg-[rgba(14,14,16,.8)] text-[var(--text)] backdrop-blur-sm transition-colors hover:border-[color-mix(in_srgb,var(--danger)_55%,transparent)] hover:text-[var(--danger-ink)]"
                  aria-label="Удалить"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
                <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 border-t border-[var(--line)] bg-[rgba(14,14,16,.72)] px-1 py-0.5 backdrop-blur-sm">
                  <button
                    type="button"
                    onClick={() => onMove(i, i - 1)}
                    disabled={i === 0}
                    className="grid h-6 w-6 place-items-center rounded-[var(--r-sm)] text-[var(--text)] transition-colors hover:bg-white/10 disabled:opacity-30"
                    aria-label="Левее"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onMove(i, i + 1)}
                    disabled={i === imageKeys.length - 1}
                    className="grid h-6 w-6 place-items-center rounded-[var(--r-sm)] text-[var(--text)] transition-colors hover:bg-white/10 disabled:opacity-30"
                    aria-label="Правее"
                  >
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

const CELL =
  "h-10 rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] px-3 text-[14px] text-[var(--text)] outline-none transition-[border-color,box-shadow] placeholder:text-[var(--text-faint)] hover:border-[var(--border-2)] focus:border-[var(--accent)] focus:shadow-[var(--ring-accent)]";

function Variants({ variants, onChange }: { variants: ProductVariant[]; onChange: (v: ProductVariant[]) => void }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="field-label">Варианты</span>
        <button
          type="button"
          onClick={() => onChange([...variants, { name: "", stock: 0 } as ProductVariant])}
          className="hit focusable font-display flex items-center gap-1 rounded-[var(--r-sm)] text-[11.5px] font-bold uppercase tracking-[0.06em] text-[var(--accent-hi)] transition-colors hover:underline"
        >
          <Plus className="h-3.5 w-3.5" /> Добавить
        </button>
      </div>
      {variants.length === 0 ? (
        <p className="text-[13px] text-[var(--text-faint)]">
          Без вариантов остаток задаётся вручную. Добавьте варианты (напр. цвет/размер), если нужен отдельный учёт.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          <div aria-hidden className="field-label flex gap-2 !text-[10.5px] !text-[var(--text-faint)]">
            <span className="min-w-0 flex-1 pl-0.5">Название</span>
            <span className="w-20 pl-0.5">Остаток</span>
            <span className="w-10 shrink-0" />
          </div>
          {variants.map((v, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                value={v.name}
                placeholder="Название"
                aria-label={`Вариант ${i + 1}: название`}
                onChange={(e) => onChange(variants.map((p, j) => (j === i ? { ...p, name: e.target.value } : p)))}
                className={cn(CELL, "min-w-0 flex-1")}
              />
              <input
                value={v.stock}
                inputMode="numeric"
                placeholder="0"
                aria-label={`Вариант ${i + 1}: остаток`}
                onChange={(e) => onChange(variants.map((p, j) => (j === i ? { ...p, stock: Number(e.target.value) || 0 } : p)))}
                className={cn(CELL, "tabular w-20")}
              />
              <button
                type="button"
                onClick={() => onChange(variants.filter((_, j) => j !== i))}
                className="nb-press focusable grid h-10 w-10 shrink-0 place-items-center rounded-[var(--r-md)] border border-[var(--border-2)] bg-[var(--surface-2)] text-[var(--text-muted)] transition-colors hover:border-[color-mix(in_srgb,var(--danger)_45%,transparent)] hover:bg-[color-mix(in_srgb,var(--danger)_14%,transparent)] hover:text-[var(--danger-ink)]"
                aria-label="Удалить вариант"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CardStatusPanel({
  status,
  confidence,
  missing,
  sources,
  notes,
  busy,
  onReady,
  onDraft,
  onAi,
  dirty,
}: {
  status: CardStatus;
  confidence?: number | null;
  missing: number;
  sources: string[];
  notes?: string | null;
  busy: boolean;
  onReady: () => void;
  onDraft: () => void;
  onAi?: () => void;
  dirty: boolean;
}) {
  return (
    <div className="mt-1 rounded-[var(--r-lg)] border border-[var(--line)] bg-[var(--bg-2)] p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="field-label !text-[10.5px] !text-[var(--text-faint)]">Карточка</span>
          <CardStatusBadge status={status} confidence={confidence} incomplete={missing} />
        </div>
        <div className="flex flex-wrap gap-2">
          {onAi && status !== "READY" && (
            <Button size="sm" variant="outline" icon={<Wand2 className="h-3.5 w-3.5" />} onClick={onAi} disabled={busy || dirty} title={dirty ? "Сначала сохраните изменения" : undefined}>
              Оформить с ИИ
            </Button>
          )}
          {status === "READY" ? (
            <Button size="sm" variant="ghost" icon={<RotateCcw className="h-3.5 w-3.5" />} loading={busy} onClick={onDraft}>
              Вернуть в черновик
            </Button>
          ) : (
            <Button size="sm" variant="surface" icon={<ShieldCheck className="h-3.5 w-3.5" />} loading={busy} onClick={onReady}>
              Отметить проверенной
            </Button>
          )}
        </div>
      </div>
      {status !== "READY" && missing > 0 && (
        <p className="mt-2 text-[12px] text-[var(--text-faint)]">Можно отметить и неполную — «неполная» останется видна в списке.</p>
      )}
      {(sources.length > 0 || notes) && (
        <div className="mt-3 border-t border-[var(--line)] pt-2.5 text-[12px] text-[var(--text-muted)]">
          {notes && <p className="mb-1.5 leading-snug">Заметка ИИ: {notes}</p>}
          {sources.length > 0 && (
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {sources.slice(0, 6).map((s) => (
                <a key={s} href={s} target="_blank" rel="noreferrer noopener" className="inline-flex max-w-[260px] items-center gap-1 truncate text-[var(--text-faint)] hover:text-[var(--accent-hi)]">
                  <ExternalLink className="h-3 w-3 shrink-0" />
                  <span className="truncate">{s.replace(/^https?:\/\/(www\.)?/, "")}</span>
                </a>
              ))}
            </div>
          )}
        </div>
      )}
      <p className="mt-2 text-[11.5px] text-[var(--text-faint)]">Статус — рабочая очередь админки, на витрину не влияет. Меняется сразу.</p>
    </div>
  );
}

function EmptyStep({ text, action }: { text: string; action?: React.ReactNode }) {
  return (
    <div className="hud-frame flex flex-col items-center gap-3 rounded-[var(--r-lg)] border border-[var(--line)] px-6 py-10 text-center">
      <SlidersHorizontal className="h-6 w-6 text-[var(--text-faint)]" />
      <p className="max-w-sm text-[13px] text-[var(--text-muted)]">{text}</p>
      {action}
    </div>
  );
}

/**
 * Progress header — a segmented bar (fits any width, no horizontal overflow) plus
 * the CURRENT step's name + counter. Segments are tappable to jump back/forward.
 */
function Stepper({ step, onJump }: { step: number; onJump: (i: number) => void }) {
  return (
    <div className="w-full">
      <div className="flex items-center gap-1.5">
        {STEPS.map((s, i) => (
          // A taller tap area around a thin 4px bar: passed = dim orange, current = orange with glow.
          <button
            key={s.key}
            type="button"
            onClick={() => onJump(i)}
            aria-label={`Шаг ${i + 1}: ${s.label}`}
            aria-current={i === step ? "step" : undefined}
            title={s.label}
            className="focusable group flex h-4 flex-1 items-center rounded-full"
          >
            <span
              className={cn(
                "h-1 w-full rounded-full transition-[background-color,box-shadow] duration-200",
                i < step
                  ? "bg-[rgba(255,102,0,.45)] group-hover:bg-[rgba(255,102,0,.6)]"
                  : i === step
                    ? "bg-[var(--accent)] shadow-[var(--glow-sm)]"
                    : "bg-[var(--surface-3)] group-hover:bg-[var(--border-2)]"
              )}
            />
          </button>
        ))}
      </div>
      <div className="mt-2 flex items-baseline justify-between gap-2">
        <span className="section-title min-w-0 truncate !text-[15px] text-[var(--ink)]">
          {step + 1}. {STEPS[step].label}
        </span>
        <span className="font-display tabular shrink-0 text-[12px] font-semibold tracking-[0.06em] text-[var(--text-faint)]">
          {step + 1}/{STEPS.length}
        </span>
      </div>
    </div>
  );
}

function Review({
  f,
  priceLabel,
  compareAtLabel,
  slug,
  stock,
  hasVariants,
  categoryPath,
  specsSummary,
  missing,
  cardStatus,
  confidence,
  onEdit,
}: {
  f: Form;
  priceLabel: string;
  compareAtLabel: string | null;
  slug: string;
  stock: number;
  hasVariants: boolean;
  categoryPath: string;
  specsSummary: { label: string; text: string }[];
  missing: number;
  cardStatus: CardStatus;
  confidence?: number | null;
  onEdit: (step: number) => void;
}) {
  const variantsCount = f.variants.filter((v) => v.name.trim()).length;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-3">
        <div className="h-24 w-24 shrink-0 overflow-hidden rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)]">
          {f.imageKeys[0] ? (
            <Image src={f.imageKeys[0]} alt="" size={200} className="aspect-square w-full" />
          ) : (
            <div className="grid h-full w-full place-items-center text-[12px] text-[var(--text-faint)]">нет фото</div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[16px] font-semibold leading-snug text-[var(--ink)]">{f.title || "Без названия"}</p>
          <p className="font-display tabular mt-1 text-[16px] font-bold text-[var(--accent-hi)]">
            {priceLabel}
            {compareAtLabel && <span className="ml-2 text-[13px] font-semibold text-[var(--text-faint)] line-through">{compareAtLabel}</span>}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <span className="field-label !text-[11px] !text-[var(--text-faint)]">
              {f.imageKeys.length} фото · {f.active ? "на витрине" : "скрыт"}
            </span>
            <CardStatusBadge status={cardStatus} confidence={confidence} compact />
          </div>
        </div>
      </div>

      <ReviewRow label="Описание" step={S.basics} onEdit={onEdit}>
        {f.description ? <span className="line-clamp-2">{f.description}</span> : <span className="text-[var(--text-faint)]">—</span>}
      </ReviewRow>
      <ReviewRow label="Склад" step={S.pricing} onEdit={onEdit}>
        {stock} шт{hasVariants ? ` · ${variantsCount} вар.` : ""}
      </ReviewRow>
      <ReviewRow label="Категория и бренд" step={S.category} onEdit={onEdit}>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {categoryPath ? <span>{categoryPath}</span> : <span className="text-[var(--warn)]">без категории</span>}
          <span className="text-[var(--text-faint)]">·</span>
          {f.brand.name ? <span>{f.brand.name}{!f.brand.id && <span className="text-[var(--text-faint)]"> (новый)</span>}</span> : <span className="text-[var(--text-faint)]">без бренда</span>}
          <span className="text-[var(--text-faint)]">·</span>
          <span>
            {CONDITION_LABEL[f.condition]}
            {f.condition !== "NEW" && f.conditionNote.trim() && <span className="text-[var(--text-muted)]"> — {f.conditionNote.trim()}</span>}
          </span>
        </span>
      </ReviewRow>
      <ReviewRow label={`Характеристики · ${specsSummary.length}`} step={S.specs} onEdit={onEdit}>
        {specsSummary.length ? (
          <span className="grid gap-x-4 gap-y-0.5 text-[13px] sm:grid-cols-2">
            {specsSummary.slice(0, 10).map((s) => (
              <span key={s.label} className="flex min-w-0 gap-1.5">
                <span className="shrink-0 text-[var(--text-faint)]">{s.label}:</span>
                <span className="truncate">{s.text}</span>
              </span>
            ))}
            {specsSummary.length > 10 && <span className="text-[var(--text-faint)]">…и ещё {specsSummary.length - 10}</span>}
          </span>
        ) : (
          <span className="text-[var(--text-faint)]">не заполнены</span>
        )}
        {missing > 0 && (
          <span className="mt-1 flex items-center gap-1.5 text-[12.5px] text-[var(--warn)]">
            <AlertTriangle className="h-3.5 w-3.5" /> Не заполнено обязательных: {missing}
          </span>
        )}
      </ReviewRow>
      <ReviewRow label="Сайт" step={S.site} onEdit={onEdit}>
        <span className="break-all font-mono text-[13px]">/product/{slug || "…"}</span>
        {f.sku.trim() && <span className="ml-2 text-[12.5px] text-[var(--text-muted)]">· арт. {f.sku.trim()}</span>}
      </ReviewRow>
      <p className="text-[11.5px] text-[var(--text-faint)]">Статус карточки: {CARD_STATUS_LABEL[cardStatus]} — меняется на шаге «Характеристики».</p>
    </div>
  );
}

function ReviewRow({ label, step, onEdit, children }: { label: string; step: number; onEdit: (step: number) => void; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-t border-[var(--line)] pt-2.5">
      <div className="min-w-0 flex-1">
        <div className="field-label !text-[11px] !text-[var(--text-faint)]">{label}</div>
        <div className="mt-0.5 flex flex-col text-[14px] text-[var(--text)]">{children}</div>
      </div>
      <button
        type="button"
        onClick={() => onEdit(step)}
        className="hit focusable font-display shrink-0 rounded-[var(--r-sm)] text-[11.5px] font-bold uppercase tracking-[0.06em] text-[var(--accent-hi)] hover:underline"
      >
        Изменить
      </button>
    </div>
  );
}

function Warning({ children, compact }: { children: React.ReactNode; compact?: boolean }) {
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-[var(--r-md)] border border-[color-mix(in_srgb,var(--warn)_40%,transparent)] bg-[color-mix(in_srgb,var(--warn)_10%,transparent)] p-2.5 text-[13px] leading-snug text-[var(--text)]",
        !compact && "mt-4"
      )}
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--warn)]" />
      <span>{children}</span>
    </div>
  );
}
