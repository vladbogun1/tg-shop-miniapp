import { ApiError } from "@shop/core/errors";
import { MutationObserver, QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearToasts, getToasts } from "../toast/store";
import { buildMutationOptions, newGuard, type ApiMutationConfig } from "./api-mutation";

function run<TData, TVars>(qc: QueryClient, config: ApiMutationConfig<TData, TVars>, guard = newGuard()) {
  const obs = new MutationObserver<TData, unknown, TVars, unknown>(qc, buildMutationOptions(qc, config, guard) as never);
  return { mutate: (v: TVars) => obs.mutate(v).catch(() => undefined), guard };
}

describe("buildMutationOptions", () => {
  beforeEach(clearToasts);

  it("ошибка сервера → тост с текстом ApiError", async () => {
    const qc = new QueryClient();
    const { mutate } = run(qc, { mutationFn: async () => { throw new ApiError("Нельзя", 409); } });
    await mutate(undefined);
    expect(getToasts().map((t) => [t.kind, t.text])).toEqual([["error", "Нельзя"]]);
  });

  it("неизвестная ошибка → errorFallback; toastOnError=false — без тоста", async () => {
    const qc = new QueryClient();
    await run(qc, { mutationFn: async () => { throw new Error("x"); }, errorFallback: "Сбой" }).mutate(undefined);
    expect(getToasts()[0]?.text).toBe("Сбой");
    clearToasts();
    await run(qc, { mutationFn: async () => { throw new Error("x"); }, toastOnError: false }).mutate(undefined);
    expect(getToasts()).toHaveLength(0);
  });

  it("успех: invalidate и тост", async () => {
    const qc = new QueryClient();
    const spy = vi.spyOn(qc, "invalidateQueries");
    await run(qc, { mutationFn: async () => 1, invalidate: [["a"], ["b"]], success: "Готово" }).mutate(undefined);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(getToasts()[0]).toMatchObject({ kind: "success", text: "Готово" });
  });

  it("двойное нажатие: второй вызов не доходит до mutationFn и не даёт тоста", async () => {
    const qc = new QueryClient();
    let release: () => void = () => {};
    const fn = vi.fn(() => new Promise<number>((r) => { release = () => r(1); }));
    const guard = newGuard();
    const a = run(qc, { mutationFn: fn }, guard);
    const b = run(qc, { mutationFn: fn }, guard);
    const p1 = a.mutate(undefined);
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 5));
    await b.mutate(undefined);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(getToasts()).toHaveLength(0);
    release();
    await p1;
  });

  it("идемпотентный ключ: тот же после 5xx, новый после 4xx и успеха", async () => {
    const qc = new QueryClient();
    const keys: string[] = [];
    const errors = [new ApiError("s", 503), new ApiError("c", 400), null];
    const { mutate } = run(qc, {
      idempotent: true,
      mutationFn: async (_v: undefined, ctx) => {
        keys.push(ctx.idempotencyKey);
        const e = errors.shift();
        if (e) throw e;
        return 1;
      },
    });
    await mutate(undefined); // 503
    await mutate(undefined); // 400 — повтор с тем же ключом
    await mutate(undefined); // новый ключ после 4xx, успех
    expect(keys[0]).toBeTruthy();
    expect(keys[1]).toBe(keys[0]);
    expect(keys[2]).not.toBe(keys[1]);
  });

  it("оптимистичное обновление откатывается при ошибке", async () => {
    const qc = new QueryClient();
    qc.setQueryData(["n"], 1);
    await run(qc, {
      mutationFn: async () => { throw new ApiError("no", 400); },
      optimistic: { key: ["n"], apply: (old) => (old as number) + 1 },
    }).mutate(undefined);
    expect(qc.getQueryData(["n"])).toBe(1);
  });
});
