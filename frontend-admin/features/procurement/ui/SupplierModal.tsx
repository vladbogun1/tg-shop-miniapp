"use client";

import { Button } from "@shop/ui/admin-button";
import { useForm } from "@shop/ui/form";
import { Modal, ModalCancel } from "@shop/ui/overlay";
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/Input";
import { useCreateSupplier } from "../queries";
import type { Supplier } from "../model/types";

interface Values {
  name: string;
  note: string;
}

/** Новый поставщик (завод): название + заметка (контакты, мессенджер). */
export function SupplierModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated?: (s: Supplier) => void }) {
  const form = useForm<Values>({ defaultValues: { name: "", note: "" } });
  const [error, setError] = useState<string | null>(null);
  const { reset, register, watch } = form;

  useEffect(() => {
    if (open) {
      reset({ name: "", note: "" });
      setError(null);
    }
  }, [open, reset]);

  const create = useCreateSupplier({
    onCreated: (s) => {
      onCreated?.(s);
      onClose();
    },
    onError: setError,
  });
  const name = watch("name");

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title="Новый поставщик"
      footer={
        <>
          <ModalCancel />
          <Button
            variant="accent"
            loading={create.isPending}
            disabled={!name.trim()}
            onClick={() => create.mutate({ name: name.trim(), note: watch("note").trim() || null })}
          >
            Добавить
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Input label="Название" {...register("name")} autoFocus />
        <Input label="Заметка" {...register("note")} placeholder="WeChat, контакт…" />
        {error && <p className="text-[13px] text-[var(--danger-ink)]">{error}</p>}
      </div>
    </Modal>
  );
}
