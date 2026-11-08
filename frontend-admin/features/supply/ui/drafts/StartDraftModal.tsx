"use client";

/**
 * Старт «Поставки с ИИ»: накладная или скрины заказа → одна кнопка. Сервер заводит черновик и дальше всё делает сам
 * (читает, сопоставляет, считает цены, пишет карточки); окно сразу уводит на черновик, где виден ход работы. Уйти
 * оттуда можно в любой момент — работа не теряется. Ручной путь (свой ИИ-чат, вставка ответа) остаётся по ссылке.
 */
import { Button } from "@shop/ui/admin-button";
import { Modal, ModalCancel } from "@shop/ui/overlay";
import { Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { AiUnavailable, uahFromMinor, useAiEstimate } from "@/features/ai";
import { readDuration } from "../../model/ai/read-summary";
import { useCreateDraft } from "../../queries-drafts";
import { FilesPanel } from "../ai/FilesPanel";
import { useReadReason } from "../ai/ReadWithAi";
import { useSupplyFiles } from "../ai/use-supply-files";

function Estimate({ n }: { n: number }) {
  const e = useAiEstimate({ feature: "SUPPLY_EXTRACT", mode: "NORMAL", items: Math.max(1, n) }).data;
  if (!e) return null;
  // Цену сервер отдаёт только финансисту; остальным — только время. Это чтение; сопоставление и карточки — отдельно.
  const read = e.p50Minor != null ? `≈ ${uahFromMinor(e.p50Minor)} · ${readDuration(e.seconds)}` : readDuration(e.seconds);
  return <span>Чтение накладной: {read}. Сопоставление и карточки новых товаров — после, обычно пара минут.</span>;
}

export function StartDraftModal({ open, onClose, onManual }: { open: boolean; onClose: () => void; onManual: () => void }) {
  const router = useRouter();
  const files = useSupplyFiles(open);
  const reason = useReadReason();
  const create = useCreateDraft();
  const n = files.files.length;

  function start() {
    create.mutate(
      files.files.map((f) => f.id),
      {
        onSuccess: (d) => {
          files.clear();
          onClose();
          router.push(`/preorders/drafts/${d.id}`);
        },
      },
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      closeOnBackdrop={false}
      title="Поставка с ИИ"
      footer={
        <>
          <button type="button" onClick={onManual} className="mr-auto min-h-[44px] text-[13px] font-semibold text-[var(--text-muted)] underline-offset-4 hover:text-[var(--text)] hover:underline">
            Разобрать вручную
          </button>
          <ModalCancel />
          <Button
            variant="accent"
            icon={<Sparkles className="h-4 w-4" />}
            disabled={n === 0 || files.uploading || !!reason || reason === undefined}
            loading={create.isPending}
            onClick={start}
          >
            Разобрать с ИИ
          </Button>
        </>
      }
    >
      <div className="flex min-w-0 flex-col gap-4">
        <p className="text-[13.5px] text-[var(--text-muted)]">
          Приложите накладную или скрины заказа. ИИ сам прочитает строки, найдёт товары в каталоге, посчитает цены и напишет карточки новых товаров.
          Когда всё будет готово, придёт уведомление «Поставка готова — проверьте»: вы посмотрите итог, поправите и примете.
        </p>
        <FilesPanel files={files} locked={create.isPending} />
        {reason ? <AiUnavailable reason={reason} /> : n > 0 && <div className="text-[12px] text-[var(--text-muted)]"><Estimate n={n} /></div>}
      </div>
    </Modal>
  );
}
