"use client";

import { useForm as useHookForm, useWatch, type DefaultValues, type FieldErrors, type FieldValues, type Resolver, type UseFormProps, type UseFormReturn } from "react-hook-form";
import { useMemo } from "react";
import { validateAll, type Rules } from "./validators";

/** Коды ошибок → текст. Нет текста для кода — показывается сам код (в разработке это видно сразу). */
export type FormMessages = Record<string, string>;

export interface UseFormConfig<T extends FieldValues> extends Omit<UseFormProps<T>, "resolver" | "defaultValues"> {
  defaultValues: DefaultValues<T>;
  /** Чистые правила по полям (см. validators.ts). */
  rules?: Rules<T>;
  /** Тексты по кодам ошибок. */
  messages?: FormMessages;
}

export type ShopForm<T extends FieldValues> = UseFormReturn<T> & {
  /** Текст ошибки поля (после попытки отправки или касания) либо undefined. */
  errorText: (name: keyof T & string) => string | undefined;
};

/** Валидация — через чистые правила: resolver react-hook-form собирается из `rules`. */
export function makeResolver<T extends FieldValues>(rules: Rules<T> | undefined, messages: FormMessages = {}): Resolver<T> {
  return async (values) => {
    const codes = validateAll(values, rules ?? {});
    const errors: Record<string, { type: string; message: string }> = {};
    for (const [name, code] of Object.entries(codes)) {
      if (code) errors[name] = { type: String(code), message: messages[String(code)] ?? String(code) };
    }
    const hasErrors = Object.keys(errors).length > 0;
    return hasErrors ? { values: {}, errors: errors as FieldErrors<T> } : { values, errors: {} };
  };
}

/**
 * Обвязка над react-hook-form: правила — чистые функции, тексты — по коду. react-hook-form в Mini App
 * подгружается только в чанках экранов с формами (оформление, отзыв, поддержка).
 */
export function useForm<T extends FieldValues>({ rules, messages, defaultValues, ...rest }: UseFormConfig<T>): ShopForm<T> {
  const resolver = useMemo(() => makeResolver<T>(rules, messages), [rules, messages]);
  const form = useHookForm<T>({ mode: "onTouched", ...rest, defaultValues, resolver });
  const errorText = (name: keyof T & string): string | undefined => {
    const err = (form.formState.errors as Record<string, { message?: unknown } | undefined>)[name];
    return typeof err?.message === "string" ? err.message : undefined;
  };
  return Object.assign(form, { errorText });
}

/**
 * Текущие значения формы с перерисовкой при любом `setValue`. `form.watch()` для этого не годится:
 * `setValue` по полю без `register` его не перерисовывает (react-hook-form смотрит только на явно названные поля).
 */
export function useFormValues<T extends FieldValues>(form: ShopForm<T>): T {
  return useWatch({ control: form.control }) as T;
}
