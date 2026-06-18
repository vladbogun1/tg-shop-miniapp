"use client";

/**
 * ProductModal — create/edit product (docs/SPEC.md admin products).
 * Fields: title, description, priceMinor (entered in UAH), currency, stock
 * (auto = sum of variant stocks when variants exist), active toggle, tags picker,
 * variants editor, images drag&drop upload -> imageKeys[].
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2, UploadCloud, X } from "lucide-react";
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
import { Modal } from "@/components/ui/Modal";
import { GlassButton } from "@/components/ui/GlassButton";
import { GlassInput } from "@/components/ui/GlassInput";
import { GlassTextarea } from "@/components/ui/GlassTextarea";
import { GlassChip } from "@/components/ui/GlassChip";
import { GlassToggle } from "@/components/ui/GlassToggle";
import { useToast } from "@/lib/toast";

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
    setImageKeys(product?.images?.map((i) => i.url ?? "").filter(Boolean) ?? []);
  }, [open, product]);

  const hasVariants = variants.length > 0;
  const effectiveStock = useMemo(
    () => (hasVariants ? variants.reduce((a, v) => a + (Number(v.stock) || 0), 0) : Number(stock) || 0),
    [hasVariants, variants, stock]
  );

  function toggleTag(id: string) {
    setTagIds((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]));
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
      wide
      title={product ? "Редактировать товар" : "Новый товар"}
      footer={
        <>
          <GlassButton variant="ghost" onClick={onClose}>
            Отмена
          </GlassButton>
          <GlassButton variant="accent" loading={saving} onClick={save}>
            Сохранить
          </GlassButton>
        </>
      }
    >
      <div className="grid gap-4 md:grid-cols-2">
        {/* Left column */}
        <div className="flex flex-col gap-4">
          <GlassInput label="Название" value={title} onChange={(e) => setTitle(e.target.value)} />
          <GlassTextarea
            label="Описание"
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <div className="grid grid-cols-2 gap-3">
            <GlassInput
              label="Цена (UAH)"
              inputMode="decimal"
              value={priceMajor}
              onChange={(e) => setPriceMajor(e.target.value)}
            />
            <GlassInput
              label="Валюта"
              value={currency}
              onChange={(e) => setCurrency(e.target.value.toUpperCase())}
            />
          </div>
          <div className="flex items-center gap-4">
            <GlassInput
              label="Остаток"
              inputMode="numeric"
              className="flex-1"
              value={hasVariants ? String(effectiveStock) : stock}
              disabled={hasVariants}
              hint={hasVariants ? "= сумма остатков вариантов" : undefined}
              onChange={(e) => setStock(e.target.value)}
            />
            <GlassToggle checked={active} onChange={setActive} label="Активен" />
          </div>
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-4">
          {/* Images */}
          <div>
            <label className="mb-2 block text-[12px] font-medium text-[var(--text-muted)]">
              Изображения
            </label>
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                uploadFiles(e.dataTransfer.files);
              }}
              onClick={() => fileRef.current?.click()}
              className="glass flex cursor-pointer flex-col items-center justify-center gap-1 rounded-[var(--r-md)] border border-dashed border-white/15 px-4 py-5 text-center text-[13px] text-[var(--text-muted)]"
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
                  <div key={key + i} className="relative">
                    <Image src={key} alt="" size={160} className="aspect-square rounded-[var(--r-sm)]" />
                    <button
                      onClick={() => setImageKeys((prev) => prev.filter((_, j) => j !== i))}
                      className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-[var(--danger)] text-white"
                      aria-label="Удалить"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Tags */}
          <div>
            <label className="mb-2 block text-[12px] font-medium text-[var(--text-muted)]">
              Теги
            </label>
            <div className="flex flex-wrap gap-2">
              {tags.length === 0 && (
                <span className="text-[13px] text-[var(--text-faint)]">Нет тегов</span>
              )}
              {tags.map((t) => (
                <GlassChip key={t.id} active={tagIds.includes(t.id)} onClick={() => toggleTag(t.id)}>
                  {t.name}
                </GlassChip>
              ))}
            </div>
          </div>

          {/* Variants */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-[12px] font-medium text-[var(--text-muted)]">Варианты</label>
              <button
                onClick={() => setVariants((v) => [...v, { name: "", stock: 0 }])}
                className="flex items-center gap-1 text-[12px] text-[var(--accent)]"
              >
                <Plus className="h-3.5 w-3.5" /> Добавить
              </button>
            </div>
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
                    className="glass flex-1 rounded-[var(--r-sm)] px-3 py-2 text-[14px] text-[var(--text)] outline-none placeholder:text-[var(--text-faint)]"
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
                    className="glass w-20 rounded-[var(--r-sm)] px-3 py-2 text-[14px] text-[var(--text)] outline-none placeholder:text-[var(--text-faint)]"
                  />
                  <button
                    onClick={() => setVariants((prev) => prev.filter((_, j) => j !== i))}
                    className="grid h-9 w-9 place-items-center rounded-[var(--r-sm)] text-[var(--text-muted)] hover:text-[var(--danger)]"
                    aria-label="Удалить вариант"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
