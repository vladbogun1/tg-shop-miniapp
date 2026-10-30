"use client";

import { Button } from "@shop/ui/admin-button";
import { useForm, useFormValues } from "@shop/ui/form";
import { Modal } from "@shop/ui/overlay";
import { toast } from "@shop/ui/toast";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import type { TeamAdmin } from "../api";
import { adminName, ROLE_OPTIONS, type AdminRoleCode } from "../model/roles";
import { useUpdateAdmin } from "../queries";
import { CodeInput } from "./auth/CodeInput";

interface Values {
  name: string;
  role: AdminRoleCode;
  code: string;
}

export function EditAdminModal({ admin, onClose }: { admin: TeamAdmin; onClose: () => void }) {
  const form = useForm<Values>({ defaultValues: { name: admin.name ?? "", role: admin.role as AdminRoleCode, code: "" } });
  const { name, role, code } = useFormValues(form);
  const roleChanged = role !== admin.role;
  const nameChanged = name.trim() !== (admin.name ?? "");

  const save = useUpdateAdmin(onClose, () => form.setValue("code", ""));
  const busy = save.isPending;

  function submit() {
    if (!name.trim()) return void toast.error("Введите имя");
    if (roleChanged && code.length !== 6) return void toast.error("Для смены роли нужен ваш код из приложения");
    save.mutate({
      id: admin.telegramUserId,
      name: nameChanged ? name.trim() : undefined,
      role: roleChanged ? role : undefined,
      code: roleChanged ? code : undefined,
    });
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Имя и роль — ${adminName(admin)}`}
      size="sm"
      closeOnBackdrop={false}
      dirty={roleChanged || nameChanged}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Отмена
          </Button>
          <Button variant="accent" loading={busy} disabled={!roleChanged && !nameChanged} onClick={submit}>
            Сохранить
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        <Input label="Имя" maxLength={64} {...form.register("name")} />
        <Select label="Роль" value={role} onChange={(v) => form.setValue("role", v as AdminRoleCode)} options={ROLE_OPTIONS} />
        {roleChanged && (
          <>
            <p className="text-[12.5px] leading-snug text-[var(--text-faint)]">
              {role === "SUPER_ADMIN"
                ? "Главный админ может приглашать, блокировать и удалять других админов."
                : "Админ потеряет доступ к разделу «Админы». Остальное — как раньше."}
            </p>
            <CodeInput id="role-code" label="Ваш код из приложения" value={code} onChange={(v) => form.setValue("code", v)} />
          </>
        )}
      </div>
    </Modal>
  );
}
