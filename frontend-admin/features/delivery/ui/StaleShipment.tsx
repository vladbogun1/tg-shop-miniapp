"use client";

/** «ТТН устарела»: красная плашка в блоке и разовое окно с объяснением, что изменилось. */
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Modal } from "@shop/ui/overlay";
import { Button } from "@shop/ui/admin-button";

export function StaleBanner({ reasons, printed, onRemake }: { reasons: string[]; printed: boolean; onRemake: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-col gap-2 rounded-[var(--r-md)] border border-[color-mix(in_srgb,var(--danger)_50%,transparent)] bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] px-3 py-2.5 text-[13px]"
    >
      <b className="flex items-start gap-2 font-semibold text-[var(--danger-ink)]">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        ТТН устарела — с ней{printed ? " и с напечатанной этикеткой" : ""} посылку не отправлять
      </b>
      <ul className="list-disc pl-6 text-[var(--text)]">
        {reasons.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
      <Button size="sm" variant="accent" className="self-start" icon={<RotateCcw className="h-4 w-4" />} onClick={onRemake}>
        Перестворити ТТН
      </Button>
    </div>
  );
}

export function StaleDialog({
  open,
  ttn,
  reasons,
  printed,
  onLater,
  onRemake,
}: {
  open: boolean;
  ttn: string;
  reasons: string[];
  printed: boolean;
  onLater: () => void;
  onRemake: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onLater}
      title="Заказ изменился — ТТН больше не подходит"
      footer={
        <>
          <Button variant="surface" onClick={onLater}>
            Позже
          </Button>
          <Button variant="accent" icon={<RotateCcw className="h-4 w-4" />} onClick={onRemake}>
            Перестворити зараз
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 text-[13.5px] leading-snug text-[var(--text)]">
        <p>
          В ТТН <b className="tabular">{ttn}</b> остались старые данные:
        </p>
        <ul className="list-disc pl-5">
          {reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
        <p className="font-semibold text-[var(--danger-ink)]">
          {printed
            ? "Этикетка уже напечатана — её нельзя клеить на эту посылку. Новая почта не меняет напечатанную ТТН: при пересоздании старую удалим и сделаем новую, этикетку напечатаете заново."
            : "Новая почта не приняла изменения — пересоздайте ТТН, прежде чем отправлять."}
        </p>
      </div>
    </Modal>
  );
}
