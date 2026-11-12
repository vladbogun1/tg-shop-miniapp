"use client";

/** Размер одной категории: четыре поля и своя кнопка «Сохранить размер» (строка сохраняется сама по себе). */
import { useState } from "react";
import { Button } from "@shop/ui/admin-button";
import { sameSize, sizeFromForm, sizeToForm, type SizeForm } from "../../model/size-form";
import type { ParcelSize } from "../../model/types";
import { useSaveCategorySize } from "../../queries";
import { SizeInputs } from "./SizeInputs";

/** Родитель ставит `key` по сохранённому размеру: после сохранения поля заполняются заново. */
export function CategorySizeFields({ id, name, size }: { id: string; name: string; size: ParcelSize }) {
  const [form, setForm] = useState<SizeForm>(() => sizeToForm(size));
  const save = useSaveCategorySize();
  const dirty = !sameSize(form, sizeToForm(size));
  return (
    <>
      <SizeInputs form={form} onChange={setForm} idPrefix={name} grow />
      <Button
        size="sm"
        variant={dirty ? "accent" : "surface"}
        disabled={!dirty}
        loading={save.isPending}
        onClick={() => save.mutate({ id, size: sizeFromForm(form) })}
      >
        Сохранить размер
      </Button>
    </>
  );
}
