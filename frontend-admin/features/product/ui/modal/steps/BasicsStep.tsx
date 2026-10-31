"use client";

import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import type { ProductCtx } from "../ctx";

export function BasicsStep({ x }: { x: ProductCtx }) {
  const { f, set } = x;
  return (
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
  );
}
