"use client";

import { ActionSheet } from "@/components/ui/ActionSheet";
import { useIsDesktop } from "@/lib/use-media";
import { moveRow, type OptionRow } from "../model/options";
import { OptionEditor } from "./OptionEditor";
import { OptionRowView } from "./OptionRowView";

/**
 * Список способов оплаты в порядке оформления. Раскрытая строка редактируется на месте (ноутбук, планшет ≥ 1024)
 * или в шторке (телефон). `openKey` держит экран: новая строка раскрывается сразу, «Показать» в панели ведёт к строке с ошибкой.
 */
export function OptionsList({
  all,
  visible,
  openKey,
  problemKey,
  setOptions,
  onOpen,
  onRemove,
}: {
  all: OptionRow[];
  visible: OptionRow[];
  openKey: string | null;
  problemKey: string | null;
  setOptions: (fn: (prev: OptionRow[]) => OptionRow[]) => void;
  onOpen: (key: string | null) => void;
  onRemove: (o: OptionRow) => void;
}) {
  const desktop = useIsDesktop();
  const patch = (key: string, p: Partial<OptionRow>) => setOptions((prev) => prev.map((o) => (o.key === key ? { ...o, ...p } : o)));
  const opened = all.find((o) => o.key === openKey) ?? null;

  return (
    <>
      <ul className="flex min-w-0 flex-col gap-2">
        {visible.map((o) => {
          const open = o.key === openKey;
          return (
            <OptionRowView
              key={o.key}
              o={o}
              index={all.indexOf(o)}
              count={all.length}
              open={open}
              invalid={o.key === problemKey}
              onOpen={() => onOpen(open ? null : o.key)}
              onPatch={(p) => patch(o.key, p)}
              onMove={(delta) => setOptions((prev) => moveRow(prev, o.key, delta))}
            >
              {open && desktop && <OptionEditor o={o} onPatch={(p) => patch(o.key, p)} onRemove={() => onRemove(o)} onDone={() => onOpen(null)} />}
            </OptionRowView>
          );
        })}
      </ul>
      <ActionSheet open={!desktop && !!opened} title="Способ оплаты" onClose={() => onOpen(null)}>
        {opened && (
          <div className="mb-3">
            <OptionEditor o={opened} inSheet onPatch={(p) => patch(opened.key, p)} onRemove={() => onRemove(opened)} onDone={() => onOpen(null)} />
          </div>
        )}
      </ActionSheet>
    </>
  );
}
