"use client";

/**
 * Товар строки поставки: на витрине он или скрыт, статус карточки, быстрый просмотр (боковая панель)
 * и правка в том же ProductModal, что и на «Товарах», не уходя со страницы поставки.
 * Новые позиции поставки часто — только что заведённые скрытые черновики, их здесь и доводят.
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Eye, EyeOff, ImageOff, Pencil } from "lucide-react";
import { adminApi, ApiError, type AdminProduct } from "@/lib/api";
import { invalidateCards } from "@/lib/cards";
import { money } from "@/lib/money";
import { Image, resolveImageSrc } from "@/lib/image";
import { PREORDERS_KEY } from "@/lib/preorders";
import { siteProductUrl } from "@/lib/support-api";
import { toast } from "@shop/ui/toast";
import { CardStatusBadge } from "@/components/catalog/CardBits";
import { usePublishGate } from "@/components/catalog/PublishGate";
import { CardCompletionModal } from "@/components/cards/CardCompletionModal";
import { ProductModal } from "@/components/products/ProductModal";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@shop/ui/admin-button";
import { Drawer } from "@shop/ui/overlay";
import { Lightbox } from "@shop/ui/overlay";

/** Товары поставки по id — из того же списка, что и экран «Товары» (кэш общий). */
export function useBatchProducts(ids: string[]): { byId: Map<string, AdminProduct>; loading: boolean } {
  const q = useQuery({ queryKey: ["products", false], queryFn: () => adminApi.products() });
  const key = ids.join(",");
  const byId = useMemo(() => {
    const want = new Set(key.split(","));
    const m = new Map<string, AdminProduct>();
    for (const p of q.data ?? []) if (want.has(p.id)) m.set(p.id, p);
    return m;
  }, [q.data, key]);
  return { byId, loading: q.isLoading };
}

/** «На сайте» / «Скрыт» (+ «нет фото»); товара нет в активном списке — значит, он в архиве. */
export function ProductStateChips({ p, loading }: { p: AdminProduct | undefined; loading: boolean }) {
  if (loading) return null;
  if (!p) return <Badge tone="danger">в архиве</Badge>;
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {p.active ? (
        <Badge tone="ok" dot>
          на сайте
        </Badge>
      ) : (
        <Badge dot>скрыт</Badge>
      )}
      <CardStatusBadge status={p.cardStatus} compact />
      {!p.images?.length && (
        <Badge tone="warn">
          <ImageOff className="h-3 w-3" /> нет фото
        </Badge>
      )}
    </span>
  );
}

/**
 * Общая логика страницы поставки: показать/скрыть (через «ворота» публикации черновиков),
 * быстрый просмотр, редактор и мастер «Оформить карточку». Карточка заказа зовёт то же самое
 * поверх своей панели — ей нужен `zClass` выше, чем у неё (z-[120]), но ниже модалок (z-[150]).
 */
export function useBatchProductTools({ zClass }: { zClass?: string } = {}) {
  const qc = useQueryClient();
  const [preview, setPreview] = useState<AdminProduct | null>(null);
  const [editing, setEditing] = useState<AdminProduct | null>(null);
  const [completion, setCompletion] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [guardPublish, gateUi] = usePublishGate((id) => setCompletion(id));

  function refresh() {
    invalidateCards(qc);
    qc.invalidateQueries({ queryKey: ["translations"] });
    qc.invalidateQueries({ queryKey: PREORDERS_KEY });
  }

  async function setActive(p: AdminProduct, active: boolean) {
    setBusy(p.id);
    try {
      const ok = active
        ? await guardPublish(p, (force) => adminApi.setProductActive(p.id, true, force))
        : (await adminApi.setProductActive(p.id, false), true);
      if (!ok) return;
      refresh();
      setPreview((cur) => (cur && cur.id === p.id ? { ...cur, active } : cur));
      toast.success(active ? `«${p.title}» теперь на сайте` : `«${p.title}» скрыт`);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Не удалось");
    } finally {
      setBusy(null);
    }
  }

  const ui = (
    <>
      <QuickView
        p={preview}
        zClass={zClass}
        busy={!!preview && busy === preview.id}
        onClose={() => setPreview(null)}
        onEdit={(p) => {
          setPreview(null);
          setEditing(p);
        }}
        onActive={setActive}
      />
      <ProductModal
        open={!!editing}
        product={editing}
        onClose={() => setEditing(null)}
        onSaved={refresh}
        onCompleteWithAi={(id) => setCompletion(id)}
      />
      {completion && (
        <CardCompletionModal
          key={completion}
          productId={completion}
          open
          reason="manual"
          onClose={() => {
            setCompletion(null);
            refresh();
          }}
        />
      )}
      {gateUi}
    </>
  );

  return { openPreview: setPreview, openEditor: setEditing, setActive, busy, ui };
}

function QuickView({
  p,
  zClass,
  busy,
  onClose,
  onEdit,
  onActive,
}: {
  p: AdminProduct | null;
  zClass?: string;
  busy: boolean;
  onClose: () => void;
  onEdit: (p: AdminProduct) => void;
  onActive: (p: AdminProduct, active: boolean) => void;
}) {
  const [zoom, setZoom] = useState<string | null>(null);
  const images = p?.images?.filter((i) => i.url) ?? [];
  const stock = p?.variants?.length ? p.variants.reduce((n, v) => n + (v.stock ?? 0), 0) : p?.stock ?? 0;
  return (
    <>
      <Drawer open={!!p} onClose={onClose} title={p?.title} zClass={zClass}>
        {p && (
          <div className="flex min-w-0 flex-col gap-4 px-4 pb-[calc(16px+var(--safe-bottom,0px))] pt-4 sm:px-5">
            <ProductStateChips p={p} loading={false} />
            {images.length ? (
              // Phone: a swipeable strip, so price, stock and the buttons stay on the first screen.
              // From sm up: the first photo big, the rest in a row under it.
              <div className="thin-scroll -mx-4 flex snap-x gap-2 overflow-x-auto px-4 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0">
                {images.map((img, n) => (
                  <button
                    key={img.id ?? n}
                    type="button"
                    onClick={() => setZoom(resolveImageSrc(img.url!, 1600))}
                    className={
                      "w-40 shrink-0 snap-start overflow-hidden rounded-[var(--r-md)] border border-[var(--line)] sm:w-auto " +
                      (n === 0 ? "sm:col-span-3" : "")
                    }
                    aria-label="Увеличить фото"
                  >
                    <Image src={img.url} alt={p.title} size={n === 0 ? 900 : 300} className="aspect-square w-full" />
                  </button>
                ))}
              </div>
            ) : (
              <div className="card-2 flex items-center gap-2 p-4 text-[13px] text-[var(--text-muted)]">
                <ImageOff className="h-4 w-4" /> Фото ещё нет
              </div>
            )}
            <div className="grid grid-cols-2 gap-3 text-[13px]">
              <Field label="Цена">{money(p.priceMinor)}</Field>
              <Field label="На складе">{stock}</Field>
              {!!p.variants?.length && (
                <Field label="Варианты" wide>
                  {p.variants.map((v) => `${v.name} — ${v.stock}`).join(" · ")}
                </Field>
              )}
            </div>
            {p.description && (
              <p className="line-clamp-6 whitespace-pre-wrap break-words text-[13px] text-[var(--text-muted)]">{p.description}</p>
            )}
            {/* phone: the actions stick to the bottom edge however long the description is */}
            <div className="sticky bottom-0 -mx-4 -mb-[calc(16px+var(--safe-bottom,0px))] flex flex-wrap gap-2 border-t border-[var(--line)] bg-[var(--surface)] px-4 pb-[calc(12px+var(--safe-bottom,0px))] pt-3 sm:static sm:m-0 sm:border-0 sm:bg-transparent sm:p-0">
              <Button variant="accent" icon={<Pencil className="h-4 w-4" />} onClick={() => onEdit(p)}>
                Редактировать
              </Button>
              <Button
                variant="outline"
                loading={busy}
                icon={p.active ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                onClick={() => onActive(p, !p.active)}
              >
                {p.active ? "Скрыть" : "Показать на сайте"}
              </Button>
              {p.active && p.slug && (
                <a href={siteProductUrl(p.slug)} target="_blank" rel="noreferrer" className="inline-flex">
                  <Button variant="ghost" icon={<ExternalLink className="h-4 w-4" />}>
                    На сайте
                  </Button>
                </a>
              )}
            </div>
          </div>
        )}
      </Drawer>
      <Lightbox src={zoom} onClose={() => setZoom(null)} />
    </>
  );
}

function Field({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? "col-span-2" : undefined}>
      <div className="text-[11px] text-[var(--text-faint)]">{label}</div>
      <div className="tabular break-words font-semibold text-[var(--ink)]">{children}</div>
    </div>
  );
}
