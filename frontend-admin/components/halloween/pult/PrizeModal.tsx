"use client";

/**
 * Edit one prize pack: name, what is inside (one line each) and photos for the remote's round card.
 * Photos come from the catalog: «Добавить товар» takes the product's first photo and adds its title
 * to the contents.
 */
import { useState } from "react";
import { PackagePlus, X } from "lucide-react";
import { hwDraw, type HwPrize } from "@/lib/halloween-api";
import { useToast } from "@/lib/toast";
import { PrizePhoto } from "./PrizePhoto";
import { Modal, ModalCancel } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { ProductPickModal } from "@/components/ProductPickModal";

const MAX_PHOTOS = 6;

export function PrizeModal({ prize, onClose, onSaved }: {
  /** null = a new pack */
  prize: HwPrize | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { push } = useToast();
  const [init] = useState(() => ({ name: prize?.name ?? "", items: (prize?.items ?? []).join("\n"), images: prize?.images ?? [] }));
  const [name, setName] = useState(init.name);
  const [items, setItems] = useState(init.items);
  const [images, setImages] = useState<string[]>(init.images);
  const [pick, setPick] = useState(false);
  const [busy, setBusy] = useState(false);
  const dirty = name !== init.name || items !== init.items || images.join() !== init.images.join();

  async function save() {
    setBusy(true);
    try {
      await hwDraw.savePrize({ id: prize?.id, name, items: items.split("\n").map((s) => s.trim()).filter(Boolean), images });
      push("Приз сохранён", "ok");
      onSaved();
    } catch (e) {
      push(e instanceof Error ? e.message : "Не получилось", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Modal open onClose={onClose} title={prize ? "Приз" : "Новый приз"} size="lg" closeOnBackdrop={false} dirty={dirty}
        footer={<><ModalCancel /><Button variant="accent" loading={busy} disabled={!name.trim()} onClick={save}>Сохранить</Button></>}>
        <div className="flex flex-col gap-4">
          <Input label="Название" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder="Килимок XL «Орнамент»" />
          <Textarea label="Что внутри — по строке на вещь" rows={5} value={items} onChange={(e) => setItems(e.target.value)} />
          <div className="flex flex-col gap-2">
            <span className="field-label">Фото на пульте (до {MAX_PHOTOS})</span>
            <div className="flex flex-wrap gap-2">
              {images.map((key) => (
                <div key={key} className="relative h-20 w-20 overflow-hidden rounded-[var(--r-md)] border border-[var(--line)]">
                  <PrizePhoto imageKey={key} size={160} className="h-full w-full object-cover" />
                  <button type="button" aria-label="Убрать фото" onClick={() => setImages(images.filter((k) => k !== key))}
                    className="focusable absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-black/70 text-white">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              <Button variant="outline" icon={<PackagePlus className="h-4 w-4" />} disabled={images.length >= MAX_PHOTOS} onClick={() => setPick(true)}>
                Добавить товар
              </Button>
            </div>
          </div>
        </div>
      </Modal>
      <ProductPickModal open={pick} title="Товар из приза" onClose={() => setPick(false)}
        onPick={(p) => {
          const key = p.images?.find((i) => i.url)?.url;
          if (key && !images.includes(key)) setImages([...images, key]);
          if (!items.split("\n").some((s) => s.trim() === p.title)) setItems(items.trim() ? `${items.trim()}\n${p.title}` : p.title);
          setPick(false);
        }} />
    </>
  );
}
