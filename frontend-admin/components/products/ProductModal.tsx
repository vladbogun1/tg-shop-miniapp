"use client";

/**
 * ProductModal — create/edit product as a STEPPED WIZARD (ChiSetup v3).
 * Steps: 1) Основное (название+описание) → 2) Фото (загрузка + порядок,
 * первое = обложка) → 3) Цена и склад (цена/валюта/остаток/варианты) →
 * 4) Теги (+активность) → 5) Сайт (адрес страницы, SEO) → 6) Проверка (обзор + создать/сохранить).
 * Mobile- and desktop-friendly: numbered progress header, one concept per step,
 * Back/Next footer with per-step validation, animated step transitions.
 * When editing, «Сохранить» is available on every step; closing with unsaved changes asks first.
 * Stock is sent only when the admin changed it, together with the value the form was opened with
 * (expectedStock) — the server answers 409 STOCK_CONFLICT if orders moved it meanwhile.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  Plus,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import {
  adminApi,
  ApiError,
  type AdminProduct,
  type ProductTag,
  type ProductVariant,
  type ProductWriteRequest,
} from "@/lib/api";
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

interface Props {
  open: boolean;
  product: AdminProduct | null; // null = create
  tags: ProductTag[];
  onClose: () => void;
  onSaved: () => void;
}

/** The editable form as plain strings — the same shape is snapshotted to detect unsaved changes. */
function initialForm(product: AdminProduct | null) {
  return {
    title: product?.title ?? "",
    description: product?.description ?? "",
    priceMajor: product ? String(toMajor(product.priceMinor)) : "",
    stock: String(product?.stock ?? 0),
    active: product?.active ?? true,
    slug: product?.slug ?? "",
    compareAtMajor: product?.compareAtMinor ? String(toMajor(product.compareAtMinor)) : "",
    seoTitle: product?.seoTitle ?? "",
    seoDescription: product?.seoDescription ?? "",
    tagIds: product?.tags?.map((t) => t.id) ?? [],
    // Keep the id: it is what tells the server "this is the same variant", so renaming one edits
    // the existing row instead of deleting it and minting a new UUID (which broke customers'
    // saved carts and the variant reference on past orders).
    variants: (product?.variants?.map((v) => ({ id: v.id, name: v.name, stock: v.stock })) ??
      []) as ProductVariant[],
    imageKeys:
      product?.images
        ?.slice()
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
        .map((i) => i.url ?? "")
        .filter(Boolean) ?? [],
  };
}

/** Field names of content_translations whose Russian source the form can change. */
const PRODUCT_TR_FIELDS = ["title", "description", "seo_title", "seo_description"] as const;

const STEPS = [
  { key: "basics", label: "Основное" },
  { key: "photos", label: "Фото" },
  { key: "pricing", label: "Цена и склад" },
  { key: "tags", label: "Теги" },
  { key: "site", label: "Сайт" },
  { key: "review", label: "Проверка" },
] as const;

/** Step slide animation (direction-aware via the `custom` prop = dir). */
const STEP_ANIM = {
  enter: (d: number) => ({ opacity: 0, x: d * 28 }),
  center: { opacity: 1, x: 0 },
  exit: (d: number) => ({ opacity: 0, x: d * -28 }),
};

export function ProductModal({ open, product, tags, onClose, onSaved }: Props) {
  const { push } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1); // animation direction

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priceMajor, setPriceMajor] = useState("");
  // The shop sells in hryvnia only; the free-text currency field let a typo ("UHA") through.
  const currency = "UAH";
  const [stock, setStock] = useState("0");
  const [active, setActive] = useState(true);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [imageKeys, setImageKeys] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [saving, setSaving] = useState(false);
  // Public site
  const [slug, setSlug] = useState("");
  const [compareAtMajor, setCompareAtMajor] = useState("");
  const [seoTitle, setSeoTitle] = useState("");
  const [seoDescription, setSeoDescription] = useState("");
  const [confirmClose, setConfirmClose] = useState(false);

  // What the form was opened with: the dirty check compares against it, and the stock values are
  // the `expectedStock` the server verifies (replaced with fresh numbers after a 409).
  const [initialSnapshot, setInitialSnapshot] = useState("");
  const baseStockRef = useRef<{ stock: number; variants: Record<string, number> }>({
    stock: 0,
    variants: {},
  });

  useEffect(() => {
    if (!open) return;
    const f = initialForm(product);
    setStep(0);
    setDir(1);
    setConfirmClose(false);
    setTitle(f.title);
    setDescription(f.description);
    setPriceMajor(f.priceMajor);
    setStock(f.stock);
    setActive(f.active);
    setSlug(f.slug);
    setCompareAtMajor(f.compareAtMajor);
    setSeoTitle(f.seoTitle);
    setSeoDescription(f.seoDescription);
    setTagIds(f.tagIds);
    setVariants(f.variants);
    setImageKeys(f.imageKeys);
    setInitialSnapshot(JSON.stringify(f));
    baseStockRef.current = {
      stock: Number(f.stock) || 0,
      variants: Object.fromEntries(
        f.variants.filter((v) => v.id).map((v) => [v.id as string, Number(v.stock) || 0])
      ),
    };
  }, [open, product]);

  // Same key order as initialForm(), so an untouched form serialises identically.
  const snapshot = JSON.stringify({
    title,
    description,
    priceMajor,
    stock,
    active,
    slug,
    compareAtMajor,
    seoTitle,
    seoDescription,
    tagIds,
    variants,
    imageKeys,
  });
  const dirty = open && snapshot !== initialSnapshot;

  /** Esc / × / «Отмена»: ask before throwing away a half-filled wizard. */
  function requestClose() {
    if (saving) return;
    if (dirty) setConfirmClose(true);
    else onClose();
  }

  // Translations a source edit will reset (uk/en of the changed fields go STALE on the site).
  const { data: translated } = useQuery({
    queryKey: ["translations", "translated-uk-en"],
    queryFn: async () => {
      const [uk, en] = await Promise.all([
        adminApi.translationsExport("uk", "translated"),
        adminApi.translationsExport("en", "translated"),
      ]);
      return [...uk, ...en];
    },
    enabled: open && !!product,
    staleTime: 60_000,
  });
  const staleAfterSave = useMemo(() => {
    if (!product || !translated) return 0;
    const changed = new Set<string>();
    if (title.trim() !== (product.title ?? "").trim()) changed.add("title");
    if (description.trim() !== (product.description ?? "").trim()) changed.add("description");
    if (seoTitle.trim() !== (product.seoTitle ?? "").trim()) changed.add("seo_title");
    if (seoDescription.trim() !== (product.seoDescription ?? "").trim()) changed.add("seo_description");
    const renamedVariants = new Set(
      variants
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
  }, [product, translated, title, description, seoTitle, seoDescription, variants]);

  const hasVariants = variants.length > 0;
  const effectiveStock = useMemo(
    () =>
      hasVariants
        ? variants.reduce((a, v) => a + (Number(v.stock) || 0), 0)
        : Number(stock) || 0,
    [hasVariants, variants, stock]
  );
  const priceMinor = toMinor(priceMajor);
  const compareAtMinor = compareAtMajor.trim() ? toMinor(compareAtMajor) : 0;
  const compareAtInvalid = compareAtMinor > 0 && compareAtMinor <= priceMinor;
  const slugPreview = slug.trim() ? slugify(slug) : slugify(title);

  function toggleTag(id: string) {
    setTagIds((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]));
  }

  function moveImage(from: number, to: number) {
    setImageKeys((prev) => {
      if (to < 0 || to >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  async function uploadFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const { key } = await adminApi.upload(file);
        setImageKeys((prev) => [...prev, key]);
      }
    } catch (e) {
      push(e instanceof ApiError ? e.message : "Ошибка загрузки", "error");
    } finally {
      setUploading(false);
    }
  }

  /** Per-step validity — gates the Next button (clicking the header can still jump). */
  function stepValid(i: number): boolean {
    if (i === 0) return title.trim().length > 0;
    if (i === 2) return priceMinor > 0 && !compareAtInvalid;
    return true;
  }

  function go(to: number) {
    if (to < 0 || to >= STEPS.length) return;
    setDir(to > step ? 1 : -1);
    setStep(to);
  }

  function next() {
    if (!stepValid(step)) {
      if (step === 0) push("Укажите название", "error");
      else if (step === 2)
        push(
          compareAtInvalid ? "Старая цена должна быть больше текущей" : "Укажите цену больше 0",
          "error"
        );
      return;
    }
    go(step + 1);
  }

  async function save() {
    if (!title.trim()) {
      push("Укажите название", "error");
      go(0);
      return;
    }
    if (priceMinor <= 0) {
      push("Укажите цену больше 0", "error");
      go(2);
      return;
    }
    if (compareAtInvalid) {
      push("Старая цена должна быть больше текущей", "error");
      go(2);
      return;
    }
    // Stock goes out only when the admin changed it (A5): an untouched field must not overwrite
    // units sold while the form was open. A changed value carries what the form was opened with.
    const base = baseStockRef.current;
    const stockChanged = !hasVariants && (Number(stock) || 0) !== base.stock;
    const body: ProductWriteRequest = {
      title: title.trim(),
      description: description.trim() || undefined,
      priceMinor,
      currency,
      ...(!product
        ? { stock: effectiveStock }
        : stockChanged
          ? { stock: Number(stock) || 0, expectedStock: base.stock }
          : {}),
      active,
      imageKeys,
      tagIds,
      variants: variants
        .filter((v) => v.name.trim())
        .map((v) => {
          const n = Number(v.stock) || 0;
          const was = v.id ? base.variants[v.id] : undefined;
          if (!product || was === undefined) return { id: v.id, name: v.name.trim(), stock: n };
          return n === was
            ? { id: v.id, name: v.name.trim() }
            : { id: v.id, name: v.name.trim(), stock: n, expectedStock: was };
        }),
      // Blank slug = the server generates one from the title (and makes it unique).
      slug: slug.trim(),
      compareAtMinor,
      seoTitle: seoTitle.trim(),
      seoDescription: seoDescription.trim(),
    };
    setSaving(true);
    try {
      if (product) await adminApi.updateProduct(product.id, body);
      else await adminApi.createProduct(body);
      push("Сохранено", "ok");
      onSaved();
      onClose();
    } catch (e) {
      if (e instanceof ApiError && e.code === "STOCK_CONFLICT" && product) {
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
      setStock(String(fresh.stock ?? 0));
      setVariants((prev) =>
        prev.map((v) =>
          v.id && freshVariants[v.id] !== undefined ? { ...v, stock: freshVariants[v.id] } : v
        )
      );
      baseStockRef.current = { stock: fresh.stock ?? 0, variants: freshVariants };
      go(2);
      push(`${message}. В форме теперь актуальный остаток — проверьте и сохраните ещё раз.`, "error");
    } catch {
      push(message, "error");
    }
  }

  const isLast = step === STEPS.length - 1;
  const slugChanged = !!product?.slug && slugPreview !== "" && slugPreview !== product.slug;
  const selectedTags = tags.filter((t) => tagIds.includes(t.id));

  return (
    <Modal
      open={open}
      onClose={requestClose}
      size="lg"
      closeOnBackdrop={false}
      fixedHeight
      title={product ? "Редактировать товар" : "Новый товар"}
      footer={
        confirmClose ? (
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            <span className="text-[13px] font-semibold text-[var(--text)]">
              Закрыть без сохранения? Изменения пропадут.
            </span>
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
        ) : (
          <div className="flex w-full items-center justify-between gap-2">
            <Button
              variant="ghost"
              onClick={() => (step === 0 ? requestClose() : go(step - 1))}
              icon={step === 0 ? undefined : <ArrowLeft className="h-4 w-4" />}
            >
              {step === 0 ? "Отмена" : "Назад"}
            </Button>
            <div className="flex items-center gap-2">
              {/* Editing: save from any step — a price fix should not mean clicking through six. */}
              {product && !isLast && (
                <Button
                  variant="surface"
                  loading={saving}
                  disabled={!dirty}
                  onClick={save}
                  icon={<Check className="h-4 w-4" />}
                >
                  Сохранить
                </Button>
              )}
              {isLast ? (
                <Button variant="accent" loading={saving} onClick={save} icon={<Check className="h-4 w-4" />}>
                  {product ? "Сохранить" : "Создать товар"}
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
      {/* Stepper header */}
      <Stepper step={step} onJump={go} />

      {staleAfterSave > 0 && (
        <Warning>
          Правка названия/описания сбросит переводы uk/en ({staleAfterSave}{" "}
          {plural(staleAfterSave, "поле", "поля", "полей")}) — на сайте снова будет русский текст, пока
          не переведёте заново в{" "}
          <Link href="/translations" className="font-semibold text-[var(--accent-hi)] hover:underline">
            «Переводах»
          </Link>
          .
        </Warning>
      )}
      {slugChanged && (step === 4 || step === 5) && (
        <Warning>
          Смена адреса страницы сломает старые ссылки:{" "}
          <span className="font-mono">/product/{product?.slug}</span> перестанет открываться (поиск,
          закладки, рассылки).
        </Warning>
      )}

      {/* Animated step body */}
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
            {step === 0 && (
              <div className="flex flex-col gap-4">
                <Input
                  label="Название"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Напр. Клавиатура Ajazz AF68"
                />
                <Textarea
                  label="Описание"
                  rows={6}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Характеристики, комплектация, состояние…"
                />
              </div>
            )}

            {step === 1 && (
              <div className="flex flex-col gap-3">
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(false);
                    uploadFiles(e.dataTransfer.files);
                  }}
                  onClick={() => fileRef.current?.click()}
                  className={cn(
                    "font-display flex cursor-pointer flex-col items-center justify-center gap-2.5 rounded-[var(--r-lg)] border px-4 py-7 text-center text-[12.5px] font-semibold uppercase tracking-[0.06em] transition-colors",
                    dragOver
                      ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-hi)]"
                      : "border-[var(--line)] bg-[var(--bg-2)] text-[var(--text-muted)] hover:border-[var(--border-2)] hover:text-[var(--text)]"
                  )}
                >
                  <span className="accent-tint grid h-11 w-11 place-items-center rounded-[var(--r-md)]">
                    <UploadCloud className="h-5 w-5" />
                  </span>
                  {uploading ? "Загрузка…" : "Перетащите фото или нажмите для загрузки"}
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    multiple
                    hidden
                    onChange={(e) => uploadFiles(e.target.files)}
                  />
                </div>
                {imageKeys.length === 0 ? (
                  <p className="text-[13px] text-[var(--text-faint)]">
                    Первое фото станет обложкой. Порядок можно менять стрелками.
                  </p>
                ) : (
                  <>
                    <p className="field-label !text-[11px] !text-[var(--text-faint)]">
                      {imageKeys.length} фото · первое = обложка
                    </p>
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                      {imageKeys.map((key, i) => (
                        // One clipping frame (r-lg): the photo, the overlays and the arrow strip all live inside
                        // it, so nothing pokes past the rounded corners. Overlays sit 6px in with r-md (12 − 6).
                        <div
                          key={key + i}
                          className={cn(
                            "group relative overflow-hidden rounded-[var(--r-lg)] border",
                            i === 0 ? "border-[rgba(255,102,0,.45)]" : "border-[var(--line)]"
                          )}
                        >
                          <Image src={key} alt="" size={200} className="aspect-square w-full" />
                          {i === 0 && (
                            <span className="font-display absolute left-1.5 top-1.5 rounded-[var(--r-md)] border border-[rgba(255,102,0,.45)] bg-[rgba(14,14,16,.8)] px-1.5 py-0.5 text-[10px] font-semibold uppercase leading-[14px] tracking-[0.06em] text-[var(--accent-hi)] backdrop-blur-sm">
                              обложка
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => setImageKeys((prev) => prev.filter((_, j) => j !== i))}
                            className="hit absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-[var(--r-md)] border border-[var(--line-strong)] bg-[rgba(14,14,16,.8)] text-[var(--text)] backdrop-blur-sm transition-colors hover:border-[color-mix(in_srgb,var(--danger)_55%,transparent)] hover:text-[var(--danger-ink)]"
                            aria-label="Удалить"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                          <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 border-t border-[var(--line)] bg-[rgba(14,14,16,.72)] px-1 py-0.5 backdrop-blur-sm">
                            <button
                              type="button"
                              onClick={() => moveImage(i, i - 1)}
                              disabled={i === 0}
                              className="grid h-6 w-6 place-items-center rounded-[var(--r-sm)] text-[var(--text)] transition-colors hover:bg-white/10 disabled:opacity-30"
                              aria-label="Левее"
                            >
                              <ArrowLeft className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => moveImage(i, i + 1)}
                              disabled={i === imageKeys.length - 1}
                              className="grid h-6 w-6 place-items-center rounded-[var(--r-sm)] text-[var(--text)] transition-colors hover:bg-white/10 disabled:opacity-30"
                              aria-label="Правее"
                            >
                              <ArrowRight className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {step === 2 && (
              <div className="flex flex-col gap-4">
                <Input
                  label="Цена, ₴"
                  inputMode="decimal"
                  value={priceMajor}
                  onChange={(e) => setPriceMajor(e.target.value)}
                  placeholder="0"
                />
                <Input
                  label="Старая цена, ₴"
                  inputMode="decimal"
                  value={compareAtMajor}
                  onChange={(e) => setCompareAtMajor(e.target.value)}
                  placeholder="не задана"
                  error={compareAtInvalid ? "Должна быть больше текущей цены" : undefined}
                  hint={
                    compareAtInvalid
                      ? undefined
                      : "Зачёркнутая цена на сайте. Пусто или 0 — не показывать."
                  }
                />
                <Input
                  label="Остаток"
                  inputMode="numeric"
                  value={hasVariants ? String(effectiveStock) : stock}
                  disabled={hasVariants}
                  hint={hasVariants ? "= сумма остатков вариантов" : undefined}
                  onChange={(e) => setStock(e.target.value)}
                />

                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <label className="field-label">Варианты</label>
                    <button
                      type="button"
                      onClick={() => setVariants((v) => [...v, { name: "", stock: 0 }])}
                      className="hit font-display flex items-center gap-1 text-[11.5px] font-bold uppercase tracking-[0.06em] text-[var(--accent-hi)] transition-colors hover:underline"
                    >
                      <Plus className="h-3.5 w-3.5" /> Добавить
                    </button>
                  </div>
                  {variants.length === 0 ? (
                    <p className="text-[13px] text-[var(--text-faint)]">
                      Без вариантов остаток задаётся вручную. Добавьте варианты (напр. цвет/размер),
                      если нужен отдельный учёт.
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
                            onChange={(e) =>
                              setVariants((prev) =>
                                prev.map((p, j) => (j === i ? { ...p, name: e.target.value } : p))
                              )
                            }
                            className="h-10 min-w-0 flex-1 rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] px-3 text-[14px] text-[var(--text)] outline-none transition-[border-color,box-shadow] placeholder:text-[var(--text-faint)] hover:border-[var(--border-2)] focus:border-[var(--accent)] focus:shadow-[var(--ring-accent)]"
                          />
                          <input
                            value={v.stock}
                            inputMode="numeric"
                            placeholder="0"
                            onChange={(e) =>
                              setVariants((prev) =>
                                prev.map((p, j) =>
                                  j === i ? { ...p, stock: Number(e.target.value) || 0 } : p
                                )
                              )
                            }
                            className="tabular h-10 w-20 rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] px-3 text-[14px] text-[var(--text)] outline-none transition-[border-color,box-shadow] placeholder:text-[var(--text-faint)] hover:border-[var(--border-2)] focus:border-[var(--accent)] focus:shadow-[var(--ring-accent)]"
                          />
                          <button
                            type="button"
                            onClick={() => setVariants((prev) => prev.filter((_, j) => j !== i))}
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
              </div>
            )}

            {step === 3 && (
              <div className="flex flex-col gap-4">
                <label className="field-label block">Теги</label>
                <div className="flex flex-wrap gap-2">
                  {tags.length === 0 && (
                    <span className="text-[13px] text-[var(--text-faint)]">
                      Тегов пока нет — создайте их во вкладке «Теги».
                    </span>
                  )}
                  {tags.map((t) => {
                    const on = tagIds.includes(t.id);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => toggleTag(t.id)}
                        aria-pressed={on}
                        className={cn(
                          "nb-chip nb-press inline-flex items-center gap-1.5 px-3 py-1.5 text-[12.5px] transition-colors",
                          on
                            ? "nb-chip-active"
                            : "text-[var(--text-muted)] hover:border-[var(--border-2)] hover:text-[var(--text)]"
                        )}
                      >
                        {on && <Check className="h-3.5 w-3.5" />}
                        {t.name}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-2 rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] p-3">
                  <Toggle checked={active} onChange={setActive} label="На витрине (виден в каталоге)" />
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="flex flex-col gap-4">
                <Input
                  label="Адрес страницы (slug)"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder={slugify(title) || "из названия"}
                  hint={
                    slug.trim()
                      ? `Страница: /product/${slugPreview || "…"}`
                      : `Пусто — сгенерируется из названия: /product/${slugPreview || "…"}`
                  }
                />
                <Input
                  label="SEO-заголовок"
                  value={seoTitle}
                  maxLength={255}
                  onChange={(e) => setSeoTitle(e.target.value)}
                  placeholder={title || "по умолчанию — название"}
                  hint="Заголовок вкладки и поисковой выдачи. Пусто — название товара."
                />
                <Textarea
                  label="SEO-описание"
                  rows={3}
                  maxLength={512}
                  value={seoDescription}
                  onChange={(e) => setSeoDescription(e.target.value)}
                  placeholder="Пусто — начало описания товара"
                  hint={`${seoDescription.length}/512 · сниппет в поиске и превью ссылки`}
                />
              </div>
            )}

            {step === 5 && (
              <Review
                title={title}
                description={description}
                priceLabel={priceMinor > 0 ? money(priceMinor, currency) : "—"}
                compareAtLabel={compareAtMinor > priceMinor ? money(compareAtMinor, currency) : null}
                slug={slugPreview}
                stock={effectiveStock}
                hasVariants={hasVariants}
                variantsCount={variants.filter((v) => v.name.trim()).length}
                imageKeys={imageKeys}
                tags={selectedTags}
                active={active}
                onEdit={go}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </Modal>
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
  title,
  description,
  priceLabel,
  compareAtLabel,
  slug,
  stock,
  hasVariants,
  variantsCount,
  imageKeys,
  tags,
  active,
  onEdit,
}: {
  title: string;
  description: string;
  priceLabel: string;
  compareAtLabel: string | null;
  slug: string;
  stock: number;
  hasVariants: boolean;
  variantsCount: number;
  imageKeys: string[];
  tags: ProductTag[];
  active: boolean;
  onEdit: (step: number) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-3">
        <div className="h-24 w-24 shrink-0 overflow-hidden rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)]">
          {imageKeys[0] ? (
            <Image src={imageKeys[0]} alt="" size={200} className="aspect-square w-full" />
          ) : (
            <div className="grid h-full w-full place-items-center text-[12px] text-[var(--text-faint)]">
              нет фото
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[16px] font-semibold leading-snug text-[var(--ink)]">{title || "Без названия"}</p>
          <p className="font-display tabular mt-1 text-[16px] font-bold text-[var(--accent-hi)]">
            {priceLabel}
            {compareAtLabel && (
              <span className="ml-2 text-[13px] font-semibold text-[var(--text-faint)] line-through">
                {compareAtLabel}
              </span>
            )}
          </p>
          <p className="field-label mt-1.5 !text-[11px] !text-[var(--text-faint)]">
            {imageKeys.length} фото · {active ? "активен" : "скрыт"}
          </p>
        </div>
      </div>

      <ReviewRow label="Описание" step={0} onEdit={onEdit}>
        {description ? (
          <span className="line-clamp-2">{description}</span>
        ) : (
          <span className="text-[var(--text-faint)]">—</span>
        )}
      </ReviewRow>
      <ReviewRow label="Склад" step={2} onEdit={onEdit}>
        {stock} шт{hasVariants ? ` · ${variantsCount} вар.` : ""}
      </ReviewRow>
      <ReviewRow label="Сайт" step={4} onEdit={onEdit}>
        <span className="break-all font-mono text-[13px]">/product/{slug || "…"}</span>
      </ReviewRow>
      <ReviewRow label="Теги" step={3} onEdit={onEdit}>
        {tags.length ? (
          <span className="flex flex-wrap gap-1">
            {tags.map((t) => (
              <span
                key={t.id}
                className="chip-tint !bg-[var(--surface-3)] text-[var(--text)]"
              >
                {t.name}
              </span>
            ))}
          </span>
        ) : (
          <span className="text-[var(--text-faint)]">—</span>
        )}
      </ReviewRow>
    </div>
  );
}

function ReviewRow({
  label,
  step,
  onEdit,
  children,
}: {
  label: string;
  step: number;
  onEdit: (step: number) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-t border-[var(--line)] pt-2.5">
      <div className="min-w-0">
        <div className="field-label !text-[11px] !text-[var(--text-faint)]">
          {label}
        </div>
        <div className="mt-0.5 text-[14px] text-[var(--text)]">{children}</div>
      </div>
      <button
        type="button"
        onClick={() => onEdit(step)}
        className="hit font-display shrink-0 text-[11.5px] font-bold uppercase tracking-[0.06em] text-[var(--accent-hi)] hover:underline"
      >
        Изменить
      </button>
    </div>
  );
}

function Warning({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-4 flex items-start gap-2 rounded-[var(--r-md)] border border-[color-mix(in_srgb,var(--warn)_40%,transparent)] bg-[color-mix(in_srgb,var(--warn)_10%,transparent)] p-2.5 text-[13px] leading-snug text-[var(--text)]">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--warn)]" />
      <span>{children}</span>
    </div>
  );
}

function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}
