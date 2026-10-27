"use client";

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api";
import { PREORDERS_KEY, preordersApi, type Supplier } from "@/lib/preorders";
import { useToast } from "@/lib/toast";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal, ModalCancel } from "@/components/ui/Modal";

/** Новый поставщик (завод): название + заметка (контакты, мессенджер). */
export function SupplierModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated?: (s: Supplier) => void }) {
  const qc = useQueryClient();
  const { push } = useToast();
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName("");
      setNote("");
      setError(null);
    }
  }, [open]);

  const create = useMutation({
    mutationFn: () => preordersApi.createSupplier({ name: name.trim(), note: note.trim() || null }),
    onSuccess: (s) => {
      qc.invalidateQueries({ queryKey: [...PREORDERS_KEY, "suppliers"] });
      push("Поставщик добавлен", "ok");
      onCreated?.(s);
      onClose();
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : "Не удалось сохранить"),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title="Новый поставщик"
      footer={
        <>
          <ModalCancel />
          <Button variant="accent" loading={create.isPending} disabled={!name.trim()} onClick={() => create.mutate()}>
            Добавить
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Input label="Название" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        <Input label="Заметка" value={note} onChange={(e) => setNote(e.target.value)} placeholder="WeChat, контакт…" />
        {error && <p className="text-[13px] text-[var(--danger-ink)]">{error}</p>}
      </div>
    </Modal>
  );
}
