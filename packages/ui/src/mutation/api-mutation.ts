/**
 * Чистая часть useApiMutation (без React — тестируется отдельно): из конфигурации собирает опции
 * react-query. Единый способ записи (docs/ARCHITECTURE-FRONT.md, 2.5): защита от двойного нажатия, ошибка → тост через
 * `errorMessage`, invalidate по конфигурации, идемпотентный ключ для оплат, оптимистичное обновление с откатом.
 */
import { ApiError, errorMessage, type Translate } from "@shop/core/errors";
import { newIdempotencyKey } from "@shop/core/http";
import type { QueryClient, QueryKey, UseMutationOptions } from "@tanstack/react-query";
import { toast } from "../toast/store";

export interface MutationContext {
  /** Один ключ на «попытку»: повтор после обрыва связи или 5xx идёт с тем же ключом, после отказа сервера (4xx) — с новым. */
  idempotencyKey: string;
}

export interface OptimisticUpdate<TVars> {
  key: QueryKey;
  /** Новое значение кэша по старому; `undefined` в старом — кэш ещё не загружен (тогда правка пропускается). */
  apply: (old: unknown, vars: TVars) => unknown;
}

export interface ApiMutationConfig<TData, TVars> {
  mutationFn: (vars: TVars, ctx: MutationContext) => Promise<TData>;
  /** Ключи кэша, которые устаревают после успеха. */
  invalidate?: readonly QueryKey[] | ((data: TData, vars: TVars) => readonly QueryKey[]);
  /** Текст тоста об успехе (не задан — без тоста). */
  success?: string | ((data: TData, vars: TVars) => string | undefined);
  /** Что показать, если у ошибки нет текста (сбой сети, исключение кода). */
  errorFallback?: string;
  /** Перевод приложения для `error.<CODE>` (покупатель); админу — текст сервера. */
  translate?: Translate;
  /** false — своя обработка ошибки в `onError`, тост не показываем. */
  toastOnError?: boolean;
  /** Мутация с идемпотентным ключом (оплаты, создание заказа). */
  idempotent?: boolean;
  optimistic?: OptimisticUpdate<TVars>;
  onSuccess?: (data: TData, vars: TVars) => void | Promise<void>;
  onError?: (error: unknown, vars: TVars) => void;
}

export const DEFAULT_ERROR_TEXT = "Не удалось выполнить действие";

/** Состояние одной «точки записи»: нажатие в полёте и ключ попытки. Живёт в ref хука. */
export interface MutationGuard {
  inFlight: boolean;
  key: string | null;
}

export function newGuard(): MutationGuard {
  return { inFlight: false, key: null };
}

interface Snapshot {
  key: QueryKey;
  previous: unknown;
}

export function buildMutationOptions<TData, TVars>(
  qc: QueryClient,
  config: ApiMutationConfig<TData, TVars>,
  guard: MutationGuard,
): UseMutationOptions<TData, unknown, TVars, Snapshot | undefined> {
  const { optimistic } = config;
  return {
    mutationFn: async (vars) => {
      if (guard.inFlight) throw new DoubleSubmitError();
      guard.inFlight = true;
      try {
        if (config.idempotent && guard.key === null) guard.key = newIdempotencyKey();
        const data = await config.mutationFn(vars, { idempotencyKey: guard.key ?? "" });
        guard.key = null;
        return data;
      } catch (e) {
        // Исход неизвестен (обрыв, 5xx) — повтор пойдёт с тем же ключом; отказ сервера — новая попытка.
        if (e instanceof ApiError && e.status < 500) guard.key = null;
        throw e;
      } finally {
        guard.inFlight = false;
      }
    },
    onMutate: async (vars) => {
      if (!optimistic || guard.inFlight) return undefined;
      await qc.cancelQueries({ queryKey: optimistic.key });
      const previous = qc.getQueryData(optimistic.key);
      if (previous !== undefined) qc.setQueryData(optimistic.key, optimistic.apply(previous, vars));
      return { key: optimistic.key, previous };
    },
    onError: (error, vars, snapshot) => {
      if (error instanceof DoubleSubmitError) return;
      if (snapshot && snapshot.previous !== undefined) qc.setQueryData(snapshot.key, snapshot.previous);
      if (config.toastOnError !== false) {
        toast.error(errorMessage(error, config.translate, config.errorFallback ?? DEFAULT_ERROR_TEXT));
      }
      config.onError?.(error, vars);
    },
    onSuccess: async (data, vars) => {
      const keys = typeof config.invalidate === "function" ? config.invalidate(data, vars) : (config.invalidate ?? []);
      for (const queryKey of keys) void qc.invalidateQueries({ queryKey });
      const text = typeof config.success === "function" ? config.success(data, vars) : config.success;
      if (text) toast.success(text);
      await config.onSuccess?.(data, vars);
    },
  };
}

/** Второе нажатие, пока первое в полёте: тихо игнорируется (не ошибка для человека). */
export class DoubleSubmitError extends Error {
  constructor() {
    super("mutation already in flight");
    this.name = "DoubleSubmitError";
  }
}
