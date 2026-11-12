"use client";

/**
 * Форма настроек одного раздела. Правки живут в форме (поле `entries`) по всем ключам, но «Сохранить», счётчик и
 * «Отменить» видят только ключи раздела (`scope`). Новая копия сервера заменяет сохранённое, а несохранённые правки
 * остаются: выключатель «ИИ» сохраняется сам и не должен стирать набираемый рядом лимит.
 */
import { useForm } from "@shop/ui/form";
import { useEffect, useMemo, useRef } from "react";
import type { SettingItem, SettingValue } from "../api";
import { initialDraft, isDirty, parse, rebaseDraft, toRaw, validate, type Draft, type DraftEntry } from "../model/draft";
import { useSaveSettings, useSettingsQuery } from "../queries";

const EMPTY_DRAFT: Draft = {};

export function useSettingsForm(scope: ReadonlySet<string>) {
  const q = useSettingsQuery();
  const save = useSaveSettings();
  const form = useForm<{ entries: Draft }>({ defaultValues: { entries: {} } });
  const draft = form.watch("entries") ?? EMPTY_DRAFT;
  const { reset: resetForm, getValues, setValue } = form;
  const serverItems = useRef<SettingItem[] | null>(null);
  useEffect(() => {
    if (!q.data) return;
    const prev = serverItems.current;
    serverItems.current = q.data.items;
    resetForm({ entries: prev ? rebaseDraft(prev, getValues("entries"), q.data.items) : initialDraft(q.data.items) });
  }, [q.data, resetForm, getValues]);

  const items = useMemo(() => q.data?.items ?? [], [q.data]);
  const dirtyItems = useMemo(() => items.filter((it) => scope.has(it.key) && isDirty(it, draft[it.key])), [items, draft, scope]);
  const invalid = dirtyItems.some((it) => !draft[it.key].reset && validate(it, draft[it.key].raw));

  const setEntry = (key: string, entry: DraftEntry) => setValue("entries", { ...getValues("entries"), [key]: entry });
  const change = (key: string, raw: string | boolean) => setEntry(key, { raw, reset: false });
  const reset = (item: SettingItem) => setEntry(item.key, { raw: toRaw(item, item.defaultValue), reset: true });
  // «ИИ»: выключатель или список — сразу на сервер одним ключом; не сохранилось — правка остаётся в форме.
  const changeAi = (key: string, raw: string | boolean) => {
    change(key, raw);
    const item = items.find((it) => it.key === key);
    if (item && (item.type === "BOOL" || item.type === "SELECT")) save.mutate({ [key]: parse(item, raw) });
  };
  const discard = () => {
    const entries = { ...getValues("entries") };
    for (const it of items) if (scope.has(it.key)) entries[it.key] = { raw: toRaw(it, it.value), reset: false };
    resetForm({ entries });
  };
  function submit() {
    if (dirtyItems.length === 0 || invalid) return;
    const values: Record<string, SettingValue | null> = {};
    for (const it of dirtyItems) {
      const e = draft[it.key];
      values[it.key] = e.reset ? null : parse(it, e.raw);
    }
    save.mutate(values);
  }

  return { q, items, draft, dirtyItems, invalid, saving: save.isPending, change, reset, changeAi, discard, submit };
}

export type SettingsForm = ReturnType<typeof useSettingsForm>;
