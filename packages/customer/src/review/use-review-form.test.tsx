import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { useReviewForm, type ReviewFormPolicy } from "./use-review-form";

const SITE_POLICY: ReviewFormPolicy = { maxLength: 2000, countCharacters: true, gateSubmit: true, clampInput: false };

function probe(initialRating: number, initialText: string) {
  let state: ReturnType<typeof useReviewForm> | undefined;
  function Probe() {
    state = useReviewForm({
      api: { submit: async () => ({}) as never },
      orderItemId: 1,
      initialRating,
      initialText,
      policy: SITE_POLICY,
      messages: { ratingRequired: "r", failed: "f" },
      onDone: () => {},
    });
    return null;
  }
  renderToString(createElement(Probe));
  return state!;
}

describe("форма отзыва на сайте: «Надіслати» гаснет, пока форма не заполнена", () => {
  it("пустая форма — нельзя", () => {
    expect(probe(0, "").canSubmit).toBe(false);
  });
  it("оценка без текста и текст без оценки — нельзя", () => {
    expect(probe(5, "коротко").canSubmit).toBe(false);
    expect(probe(0, "достаточно длинный текст отзыва").canSubmit).toBe(false);
  });
  it("оценка и достаточно текста — можно", () => {
    expect(probe(4, "достаточно длинный текст отзыва").canSubmit).toBe(true);
  });
});
