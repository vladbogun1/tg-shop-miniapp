"use client";

/**
 * Publishing gate: putting a product on the storefront when its card is not completed.
 *  - 409 CARD_NOT_READY → «Карточка не оформлена»: «Оформить с ИИ» or «Выложить без оформления»
 *    (the same call again with ?force=1);
 *  - 409 PRODUCT_NOT_PUBLISHABLE → what is missing (price / category), nothing to force.
 *
 *   const [guard, gateUi] = usePublishGate((id) => openCompletion(id));
 *   const ok = await guard(product, (force) => adminApi.setProductActive(id, true, force));
 */
import { AlertTriangle, Rocket, Wand2 } from "lucide-react";
import { useCallback, useRef, useState, type ReactNode } from "react";
import { ApiError } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";

interface Gate {
  kind: "card" | "missing";
  productId: string;
  title: string;
  message: string;
  missing: string[];
}

/** «price,category» / «нет цены» → Russian names of what blocks publishing. */
function missingOf(message: string): string[] {
  const m = message.toLowerCase();
  const out: string[] = [];
  if (/price|цен/.test(m)) out.push("цена");
  if (/categor|категор/.test(m)) out.push("категория");
  if (/photo|image|фото/.test(m)) out.push("фото");
  return out;
}

export function usePublishGate(
  onCompleteWithAi: (productId: string) => void
): [(p: { id: string; title: string }, action: (force: boolean) => Promise<unknown>) => Promise<boolean>, ReactNode] {
  const [gate, setGate] = useState<Gate | null>(null);
  const [busy, setBusy] = useState(false);
  const retry = useRef<{ action: (force: boolean) => Promise<unknown>; resolve: (ok: boolean) => void } | null>(null);

  const guard = useCallback(async (p: { id: string; title: string }, action: (force: boolean) => Promise<unknown>) => {
    try {
      await action(false);
      return true;
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && (e.code === "CARD_NOT_READY" || e.code === "PRODUCT_NOT_PUBLISHABLE")) {
        return new Promise<boolean>((resolve) => {
          retry.current?.resolve(false);
          retry.current = { action, resolve };
          setGate({
            kind: e.code === "CARD_NOT_READY" ? "card" : "missing",
            productId: p.id,
            title: p.title,
            message: e.message,
            missing: missingOf(e.message),
          });
        });
      }
      throw e;
    }
  }, []);

  function close(ok: boolean) {
    retry.current?.resolve(ok);
    retry.current = null;
    setGate(null);
  }

  async function force() {
    const r = retry.current;
    if (!r) return;
    setBusy(true);
    try {
      await r.action(true);
      close(true);
    } catch (e) {
      setGate((g) =>
        g && e instanceof ApiError && e.code === "PRODUCT_NOT_PUBLISHABLE"
          ? { ...g, kind: "missing", message: e.message, missing: missingOf(e.message) }
          : g && { ...g, message: e instanceof ApiError ? e.message : "Не удалось выложить" }
      );
    } finally {
      setBusy(false);
    }
  }

  const ui = (
    <Modal
      key="publish-gate"
      open={!!gate}
      onClose={() => close(false)}
      size={gate?.kind === "card" ? "md" : "sm"}
      title={gate?.kind === "card" ? "Карточка не оформлена" : "Нельзя выложить"}
      footer={
        gate?.kind === "card" ? (
          <>
            <Button variant="ghost" onClick={() => close(false)} disabled={busy}>
              Отмена
            </Button>
            <Button variant="surface" loading={busy} icon={<Rocket className="h-4 w-4" />} onClick={force}>
              Выложить без оформления
            </Button>
            <Button
              variant="accent"
              icon={<Wand2 className="h-4 w-4" />}
              disabled={busy}
              onClick={() => {
                const id = gate.productId;
                close(false);
                onCompleteWithAi(id);
              }}
            >
              Оформить с ИИ
            </Button>
          </>
        ) : (
          <Button variant="accent" onClick={() => close(false)}>
            Понятно
          </Button>
        )
      }
    >
      {gate && (
        <div className="flex flex-col gap-3 text-[14px] leading-relaxed text-[var(--text-muted)]">
          {gate.kind === "card" ? (
            <p>
              Карточка «<b className="text-[var(--text)]">{gate.title}</b>» ещё черновик: характеристики, описание и переводы не
              оформлены — покупатель увидит пустой блок характеристик, а фильтры товар не найдут. Оформите её с ИИ (пара минут)
              или выложите как есть.
            </p>
          ) : (
            <>
              <p>
                «<b className="text-[var(--text)]">{gate.title}</b>» пока не может быть на витрине.
              </p>
              {gate.missing.length > 0 ? (
                <ul className="flex flex-col gap-1">
                  {gate.missing.map((m) => (
                    <li key={m} className="flex items-center gap-2 text-[var(--text)]">
                      <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--warn)]" /> Не задана {m}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[var(--text)]">{gate.message}</p>
              )}
              <p className="text-[12.5px] text-[var(--text-faint)]">Заполните это в товаре и включите «На витрине» снова.</p>
            </>
          )}
        </div>
      )}
    </Modal>
  );

  return [guard, ui];
}
