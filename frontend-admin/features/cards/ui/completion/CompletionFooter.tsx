"use client";

import { Rocket, Save } from "lucide-react";
import { Button } from "@shop/ui/admin-button";
import { ModalCancel } from "@shop/ui/overlay";
import { Toggle } from "@/components/ui/Toggle";
import type { CardCompletion } from "./use-card-completion";

/** Низ окна: «Сразу выложить», «Закрыть»/«Готово», «Сохранить (и выложить)». */
export function CompletionFooter({ c }: { c: CardCompletion }) {
  const { saved, publish, setPublish, saving, payload } = c;
  return (
    <div className="flex w-full flex-wrap items-center gap-3">
      {!saved && (
        <div className="min-w-[200px]">
          <Toggle checked={publish} onChange={setPublish} label="Сразу выложить на витрину" />
        </div>
      )}
      <span className="ml-auto" />
      <ModalCancel disabled={saving}>{saved ? "Готово" : "Закрыть"}</ModalCancel>
      {!saved && (
        <Button
          variant="accent"
          chamfer
          icon={publish ? <Rocket className="h-4 w-4" /> : <Save className="h-4 w-4" />}
          loading={saving}
          disabled={!payload}
          onClick={c.save}
        >
          {publish ? "Сохранить и выложить" : "Сохранить"}
        </Button>
      )}
    </div>
  );
}
