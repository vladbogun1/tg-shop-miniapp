"use client";

/**
 * ProductModal — create/edit product (Neo-Brutalism restyle).
 * Fields: title, description, priceMinor (entered in UAH), currency, stock
 * (auto = sum of variant stocks when variants exist), active toggle, tags picker
 * (multi-select chips), variants editor, images drag&drop upload -> imageKeys[].
 * Image order is editable (first = cover); the order maps to sortOrder on save.
 * Functionality + API calls are identical to the original; only the look changed.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Plus, Trash2, UploadCloud, X } from "lucide-react";
import {
  adminApi,
  ApiError,
  type Product,
  type ProductTag,
  type ProductVariant,
  type ProductWriteRequest,
} from "@/lib/api";
import { toMajor, toMinor } from "@/lib/money";
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
  product: Product | null; // null = create
  tags: ProductTag[];
  onClose: () => void;
  onSaved: () => void;
}

export function ProductModal({ open, product, tags, onClose, onSaved }: Props) {
  const { push } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priceMajor, setPriceMajor] = useState("");
  const [currency, setCurrency] = useState("UAH");
  const [stock, setStock] = useState("0");
  const [active, setActive] = useState(true);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [imageKeys, setImageKeys] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(product?.title ?? "");
    setDescription(product?.description ?? "");
    setPriceMajor(product ? String(toMajor(product.priceMinor)) : "");
    setCurrency(product?.currency ?? "UAH");
    setStock(String(product?.stock ?? 0));
    setActive(product?.active ?? true);
    setTagIds(product?.tags?.map((t) => t.id) ?? []);
    setVariants(product?.variants?.map((v) => ({ name: v.name, stock: v.stock })) ?? []);
    setImageKeys(
      product?.images
        ?.slice()
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
        .map((i) => i.url ?? "")
        .filter(Boolean) ?? []
    );
  }, [open, product]);

  const hasVariants = variants.length > 0;
  const effectiveStock = useMemo(
    () =>
      hasVariants
        ? variants.reduce((a, v) => a + (Number(v.stock) || 0), 0)
        : Number(stock) || 0,
    [hasVariants, variants, stock]
  );

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

  async function save() {
    if (!title.trim()) {
      push("Укажите название", "error");
      return;
    }
    const body: ProductWriteRequest = {
      title: title.trim(),
      description: description.trim() || undefined,
      priceMinor: toMinor(priceMajor),
      currency,
      stock: effectiveStock,
      active,
      imageKeys,
      tagIds,
      variants: variants
        .filter((v) => v.name.trim())
        .map((v) => ({ name: v.name.trim(), stock: Number(v.stock) || 0 })),
    };
    setSaving(true);
    try {
      if (product) await adminApi.updateProduct(product.id, body);
      else await adminApi.createProduct(body);
      push("Сохранено", "ok");
      onSaved();
      onClose();
    } catch (e) {
      push(e instanceof ApiError ? e.message : "Не удалось сохранить", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={product ? "Редактировать товар" : "Новый товар"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button variant="accent" loading={saving} onClick={save}>
            Сохранить
          </Button>
        </>
      }
    >
      <div className="grid gap-5 md:grid-cols-2">
        {/* Left column */}
        <div className="flex flex-col gap-4">
          <Input label="Название" value={title} onChange={(e) => setTitle(e.target.value)} />
          <Textarea
            label="Описание"
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Цена (UAH)"
              inputMode="decimal"
              value={priceMajor}
              onChange={(e) => setPriceMajor(e.target.value)}
            />
            <Input
              label="Валюта"
              value={currency}
              onChange={(e) => setCurrency(e.target.value.toUpperCase())}
            />
          </div>
          <div className="flex items-end gap-4">
            <Input
              label="Остаток"
              inputMode="numeric"
              className="flex-1"
              value={hasVariants ? String(effectiveStock) : stock}
              disabled={hasVariants}
              hint={hasVariants ? "= сумма остатков вариантов" : undefined}
              onChange={(e) => setStock(e.target.value)}
            />
            <div className="pb-2.5">
              <Toggle checked={active} onChange={setActive} label="Активен" />
            </div>
          </div>

          {/* Variants */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-[12px] font-extrabold uppercase tracking-wide text-[var(--text-muted)]">
                Варианты
              </label>
              <button
                type="button"
                onClick={() => setVariants((v) => [...v, { name: "", stock: 0 }])}
                className="flex items-center gap-1 text-[12px] font-extrabold uppercase tracking-wide text-[var(--accent)] transition-colors hover:text-[var(--accent-2)]"
              >
                <Plus className="h-3.5 w-3.5" /> Добавить
              </button>
            </div>
            {variants.length === 0 ? (
              <p className="text-[13px] text-[var(--text-faint)]">
                Без вариантов остаток задаётся вручную.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
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
                      className="focusable min-w-0 flex-1 rounded-[var(--r-md)] border-2 border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-[14px] text-[var(--text)] outline-none transition-colors placeholder:text-[var(--text-faint)] focus:border-[var(--accent)]"
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
                      className="focusable w-20 rounded-[var(--r-md)] border-2 border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-[14px] text-[var(--text)] outline-none transition-colors placeholder:text-[var(--text-faint)] focus:border-[var(--accent)]"
                    />
                    <button
                      type="button"
                      onClick={() => setVariants((prev) => prev.filter((_, j) => j !== i))}
                      className="nb-press grid h-9 w-9 shrink-0 place-items-center rounded-[var(--r-sm)] border-2 border-[var(--line)] bg-[var(--surface-2)] text-[var(--text)] shadow-[3px_3px_0_var(--shadow)] transition-colors hover:bg-[var(--danger)] hover:text-[var(--accent-ink)]"
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

        {/* Right column */}
        <div className="flex flex-col gap-4">
          {/* Images */}
          <div>
            <label className="mb-2 block text-[12px] font-extrabold uppercase tracking-wide text-[var(--text-muted)]">
              Изображения
            </label>
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
                "flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-[var(--r-md)] border-[3px] border-dashed px-4 py-6 text-center text-[13px] font-bold uppercase tracking-wide transition-colors",
                dragOver
                  ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                  : "border-[var(--line)] bg-[var(--surface-2)] text-[var(--text-muted)] hover:border-[var(--accent)]"
              )}
            >
              <UploadCloud className="h-5 w-5" />
              {uploading ? "Загрузка…" : "Перетащите или нажмите для загрузки"}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(e) => uploadFiles(e.target.files)}
              />
            </div>
            {imageKeys.length > 0 && (
              <div className="mt-3 grid grid-cols-4 gap-2">
                {imageKeys.map((key, i) => (
                  <div key={key + i} className="group relative">
                    <Image
                      src={key}
                      alt=""
                      size={160}
                      className="aspect-square w-full rounded-[var(--r-sm)] border-2 border-[var(--line)]"
                    />
                    {i === 0 && (
                      <span className="absolute left-1 top-1 rounded-[var(--r-sm)] border-2 border-[var(--line)] bg-[var(--c3)] px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-[var(--accent-ink)]">
                        обложка
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => setImageKeys((prev) => prev.filter((_, j) => j !== i))}
                      className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-[var(--r-sm)] border-2 border-[var(--line)] bg-[var(--danger)] text-[var(--accent-ink)] shadow-[2px_2px_0_var(--shadow)]"
                      aria-label="Удалить"
                    >
                      <X className="h-3 w-3" />
                    </button>
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-black/55 px-1 py-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        type="button"
                        onClick={() => moveImage(i, i - 1)}
                        disabled={i === 0}
                        className="pointer-events-auto grid h-5 w-5 place-items-center rounded text-white disabled:opacity-30"
                        aria-label="Левее"
                      >
                        <ArrowLeft className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveImage(i, i + 1)}
                        disabled={i === imageKeys.length - 1}
                        className="pointer-events-auto grid h-5 w-5 place-items-center rounded text-white disabled:opacity-30"
                        aria-label="Правее"
                      >
                        <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Tags */}
          <div>
            <label className="mb-2 block text-[12px] font-extrabold uppercase tracking-wide text-[var(--text-muted)]">
              Теги
            </label>
            <div className="flex flex-wrap gap-2">
              {tags.length === 0 && (
                <span className="text-[13px] text-[var(--text-faint)]">Нет тегов</span>
              )}
              {tags.map((t) => {
                const on = tagIds.includes(t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => toggleTag(t.id)}
                    className={cn(
                      "nb-press rounded-[var(--r-sm)] border-2 border-[var(--line)] px-3 py-1 text-[13px] font-bold uppercase tracking-wide transition-colors",
                      on
                        ? "bg-[var(--accent)] text-[var(--accent-ink)] shadow-[3px_3px_0_var(--shadow)]"
                        : "bg-[var(--surface-2)] text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
                    )}
                  >
                    {t.name}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
