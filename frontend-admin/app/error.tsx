"use client";

/** Crash screen inside the admin shell: a failed page does not take the navigation with it. */
import { useEffect } from "react";
import { reportRenderError } from "@/features/telemetry";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
    reportRenderError(error, "page");
  }, [error]);

  return (
    <div role="alert" className="mx-auto mt-16 flex max-w-sm flex-col items-center gap-3 px-4 text-center">
      <h1 className="text-lg font-bold text-[var(--ink)]">Что-то пошло не так</h1>
      <p className="text-sm text-[var(--text-muted)]">Страница не загрузилась. Данные не потеряны — попробуйте ещё раз.</p>
      <button
        type="button"
        onClick={reset}
        className="rounded-md bg-[var(--accent)] px-5 py-2.5 text-sm font-bold text-black"
      >
        Повторить
      </button>
    </div>
  );
}
