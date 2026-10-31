"use client";

import { slugify } from "@/features/catalog";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import type { ProductCtx } from "../ctx";

export function SiteStep({ x }: { x: ProductCtx }) {
  const { f, set, slugPreview } = x;
  return (
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
  );
}
