"use client";

import { Save } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Toggle } from "@/components/ui/Toggle";
import { Button } from "@shop/ui/admin-button";
import { productsWord } from "../../model";
import { AUTO_READY_OVERALL, RED_FIELD } from "../../model/selection";
import type { AnswerReview } from "./use-answer-review";

/** Липкая панель сохранения: кнопка, «Заменить характеристики целиком», «Уверенные — сразу в „Готово“», пояснения. */
export function SaveBar({ a }: { a: AnswerReview }) {
  const { payload, sending, send, replaceSpecs, setReplaceSpecs, autoMark, setAutoMark, toReady } = a;
  return (
    <>
      <div
        style={{ bottom: "var(--bottom-nav)" }}
        className="sticky z-10 -mx-4 mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[var(--line)] bg-[var(--surface)] px-4 py-3 sm:-mx-5 sm:px-5"
      >
        <Button variant="accent" chamfer size="lg" icon={<Save className="h-4 w-4" />} loading={sending} disabled={payload.length === 0} onClick={send}>
          Сохранить {payload.length} {productsWord(payload.length)}
        </Button>
        <div className="min-w-[220px]">
          <Toggle checked={replaceSpecs} onChange={setReplaceSpecs} label="Заменить характеристики целиком" />
        </div>
        <div className="min-w-[220px]">
          <Toggle checked={autoMark} onChange={setAutoMark} label="Уверенные — сразу в «Готово»" />
        </div>
      </div>
      {payload.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[12.5px] text-[var(--text-muted)]">
          <Badge tone="ok" dot>
            станут «Готово»: {toReady}
          </Badge>
          <Badge tone="info" dot>
            уйдут в «Проверить»: {payload.length - toReady}
          </Badge>
          <span>
            {autoMark
              ? `«Готово» — если ИИ уверена в карточке на ${AUTO_READY_OVERALL} % и больше и среди сохраняемых полей нет догадок (ниже ${RED_FIELD} %).`
              : "Все сохранённые карточки уйдут в «Проверить»."}
          </span>
        </div>
      )}

      {replaceSpecs && (
        <div className="mt-2 text-[12px] font-semibold text-[color-mix(in_srgb,var(--warn)_80%,var(--text))]">
          ! Характеристики, которых нет среди отмеченных полей, будут удалены у товара.
        </div>
      )}
    </>
  );
}
