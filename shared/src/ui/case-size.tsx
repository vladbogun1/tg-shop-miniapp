"use client";

/**
 * The size of a case prize with sizes (V59): at checkout the fullest size was held, the customer picks
 * theirs among those in stock — on the prize card of the opening screen and in the order page panel.
 * While `pending` no size is marked (the held one is only a guess); once chosen it stays marked and
 * may be changed while the order is still being put together (`changeable`).
 */
import { useEffect, useState } from "react";
import type { CaseSize } from "../giftcase";

export interface CaseSizeTexts {
  /** «Оберіть розмір» */
  choose: string;
  /** «Розмір» */
  label: string;
  /** «Розмір {s} — додано до замовлення» */
  chosen: string;
  /** «Не вдалося змінити розмір — спробуйте інший» */
  error: string;
}

export function CaseSizePicker({
  size,
  texts,
  onChoose,
}: {
  size: CaseSize;
  texts: CaseSizeTexts;
  /** POST …/gift-case/size; resolves with the new state. Omit to show the size read-only. */
  onChoose?: (variantId: string) => Promise<CaseSize>;
}) {
  const [state, setState] = useState(size);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState(false);
  const [justChose, setJustChose] = useState(false);
  useEffect(() => setState(size), [size]);

  const editable = !!onChoose && state.changeable && state.options.length > 1;
  if (!editable) {
    if (state.pending) return null;
    return (
      <div className="gc-size">
        <span className="gc-size-label">
          {texts.label}: {state.name}
        </span>
      </div>
    );
  }
  const pick = async (variantId: string) => {
    if (!onChoose || busy) return;
    setBusy(variantId);
    setErr(false);
    try {
      const next = await onChoose(variantId);
      setState(next);
      setJustChose(true);
    } catch {
      setErr(true);
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className={`gc-size${state.pending ? " is-pending" : ""}`} role="group" aria-label={texts.label}>
      <span className="gc-size-label">{state.pending ? texts.choose : texts.label}</span>
      <div className="gc-size-list">
        {state.options.map((o) => (
          <button
            key={o.variantId}
            type="button"
            className="gc-size-opt"
            aria-pressed={!state.pending && o.variantId === state.variantId}
            aria-busy={busy === o.variantId}
            disabled={!!busy}
            onClick={() => void pick(o.variantId)}
          >
            {o.name}
          </button>
        ))}
      </div>
      {err ? (
        <p className="gc-err" role="alert" style={{ textAlign: "inherit" }}>
          {texts.error}
        </p>
      ) : (
        justChose && !state.pending && <span className="gc-size-done">✓ {texts.chosen.replace("{s}", state.name)}</span>
      )}
    </div>
  );
}
