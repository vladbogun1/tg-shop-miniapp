"use client";

import { Button } from "@shop/ui/admin-button";
import { useForm } from "@shop/ui/form";
import { Modal } from "@shop/ui/overlay";
import { Send } from "lucide-react";
import { useState } from "react";
import { Autocomplete } from "@/components/ui/Autocomplete";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { adminApi, type UserCardDto } from "@/lib/api";
import { cn } from "@/lib/cn";
import type { InviteCreated, TeamAdmin } from "../api";
import { adminName, ROLE_OPTIONS, userLabel, type AdminRoleCode } from "../model/roles";
import { useInviteAdmin } from "../queries";
import { CodeInput } from "./auth/CodeInput";

interface Values {
  manualId: string;
  name: string;
  role: AdminRoleCode;
  code: string;
}

interface Props {
  initialTelegramId?: number;
  admins: TeamAdmin[];
  onClose: () => void;
  onCreated: (created: InviteCreated, who: string) => void;
}

function hasPasswordLogin(a?: TeamAdmin): boolean {
  return !!a && !!a.username && a.passwordSet;
}

function invitePayload(a: { tgId: number; existing?: TeamAdmin; name: string; role: AdminRoleCode; code: string }) {
  const name = a.name.trim();
  if (a.existing) return { telegramUserId: a.tgId, code: a.code, who: adminName(a.existing) };
  return { telegramUserId: a.tgId, name, role: a.role, code: a.code, who: name };
}

function InviteFooter(p: { existing: boolean; pending: boolean; ready: boolean; onClose: () => void; onSubmit: () => void }) {
  return (
    <>
      <Button variant="ghost" onClick={p.onClose} disabled={p.pending}>
        Отмена
      </Button>
      <Button variant="accent" loading={p.pending} disabled={!p.ready} icon={<Send className="h-4 w-4" />} onClick={p.onSubmit}>
        {p.existing ? "Отправить ссылку" : "Пригласить"}
      </Button>
    </>
  );
}

function parseTelegramId(raw: string): number | null {
  const v = raw.trim();
  return /^\d{1,15}$/.test(v) ? Number(v) : null;
}

/** Можно ли отправлять приглашение: есть id, код из 6 цифр и либо новое имя, либо «живой» админ без логина. */
function canInvite(a: { tgId: number | null; code: string; name: string; existing?: TeamAdmin; hasLogin: boolean }): boolean {
  if (!a.tgId || a.code.length !== 6) return false;
  if (!a.existing) return !!a.name.trim();
  return a.existing.active && !a.hasLogin && !a.existing.self;
}

function ExistingNotice({ existing, hasLogin }: { existing: TeamAdmin; hasLogin: boolean }) {
  const blocked = hasLogin || !existing.active || existing.self;
  const who = adminName(existing);
  let text: string;
  if (existing.self) text = "Это вы.";
  else if (!existing.active) text = `«${who}» заблокирован — сначала разблокируйте.`;
  else if (hasLogin) text = `«${who}» уже админ с логином. Забыл пароль — «Сбросить пароль» в его меню.`;
  else text = `«${who}» уже админ, но входит только через Telegram. Ему придёт ссылка, чтобы задать логин и пароль (и 2FA, если её нет). Роль не меняется.`;
  return (
    <div
      className={cn(
        "rounded-[var(--r-md)] border px-3 py-2.5 text-[13px] leading-snug",
        blocked
          ? "border-[color-mix(in_srgb,var(--danger)_40%,transparent)] text-[var(--danger-ink)]"
          : "border-[var(--line)] bg-[var(--surface-2)] text-[var(--text-muted)]",
      )}
    >
      {text}
    </div>
  );
}

interface TargetPickerProps {
  manual: boolean;
  onToggleManual: () => void;
  manualId: string;
  onManualId: (v: string) => void;
  picked: UserCardDto | null;
  onPick: (u: UserCardDto) => void;
  onClear: () => void;
}

/** Кого приглашаем: из пользователей магазина или по числовому Telegram id. */
function TargetPicker({ manual, onToggleManual, manualId, onManualId, picked, onPick, onClear }: TargetPickerProps) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="field-label">Telegram нового админа</span>
        <button type="button" className="hit text-[12px] font-semibold text-[var(--accent-hi)] hover:underline" onClick={onToggleManual}>
          {manual ? "Выбрать из пользователей" : "Ввести id вручную"}
        </button>
      </div>
      {manual ? (
        <Input
          aria-label="Telegram id"
          inputMode="numeric"
          placeholder="например, 977067472"
          value={manualId}
          onChange={(e) => onManualId(e.target.value.replace(/\D/g, ""))}
          hint="Числовой id. Его покажет, например, @userinfobot."
        />
      ) : (
        <Autocomplete<UserCardDto>
          placeholder="Имя, @username или id"
          selectedLabel={picked ? `${userLabel(picked)} · ${picked.telegramUserId}` : null}
          fetchItems={(q) => adminApi.users({ q, size: 8, sortBy: "lastSeenAt", sortDir: "desc" })}
          itemLabel={userLabel}
          itemSubLabel={(u) => [u.username ? `@${u.username}` : null, `id ${u.telegramUserId}`].filter(Boolean).join(" · ")}
          itemKey={(u) => String(u.telegramUserId)}
          onSelect={onPick}
          onClear={onClear}
        />
      )}
      {!manual && (
        <p className="mt-1.5 text-[12px] text-[var(--text-faint)]">
          Из пользователей магазина. Бот сможет написать, только если человек хоть раз нажал /start.
        </p>
      )}
    </div>
  );
}

export function InviteModal({ initialTelegramId, admins, onClose, onCreated }: Props) {
  const [manual, setManual] = useState(!!initialTelegramId);
  const [picked, setPicked] = useState<UserCardDto | null>(null);
  const form = useForm<Values>({
    defaultValues: { manualId: initialTelegramId ? String(initialTelegramId) : "", name: "", role: "ADMIN", code: "" },
  });
  const { manualId, name, role, code } = form.watch();

  const tgId = manual ? parseTelegramId(manualId) : (picked?.telegramUserId ?? null);
  const existing = tgId ? admins.find((a) => a.telegramUserId === tgId) : undefined;
  const hasLogin = hasPasswordLogin(existing);
  const ready = canInvite({ tgId, code, name, existing, hasLogin });

  const invite = useInviteAdmin(onCreated, () => form.setValue("code", ""));

  function submit() {
    if (!ready || !tgId) return;
    invite.mutate(invitePayload({ tgId, existing, name, role, code }));
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={existing ? "Выдать логин и пароль" : "Пригласить админа"}
      closeOnBackdrop={false}
      dirty={!!tgId || !!name}
      footer={<InviteFooter existing={!!existing} pending={invite.isPending} ready={ready} onClose={onClose} onSubmit={submit} />}
    >
      <div className="flex flex-col gap-4">
        <TargetPicker
          manual={manual}
          onToggleManual={() => setManual((v) => !v)}
          manualId={manualId}
          onManualId={(v) => form.setValue("manualId", v)}
          picked={picked}
          onPick={(u) => {
            setPicked(u);
            if (!name.trim()) form.setValue("name", userLabel(u).replace(/^@/, ""));
          }}
          onClear={() => setPicked(null)}
        />

        {existing ? (
          <ExistingNotice existing={existing} hasLogin={hasLogin} />
        ) : (
          <>
            <Input label="Имя в админке" maxLength={64} placeholder="Например, Оля — склад" {...form.register("name")} />
            <Select label="Роль" value={role} onChange={(v) => form.setValue("role", v as AdminRoleCode)} options={ROLE_OPTIONS} />
          </>
        )}

        <CodeInput id="invite-code" label="Ваш код из приложения" value={code} onChange={(v) => form.setValue("code", v)} />
        <p className="text-[12px] leading-snug text-[var(--text-faint)]">
          Бот пришлёт ссылку на 48 часов: человек задаст логин и пароль и подключит приложение-аутентификатор. Пока он этого не
          сделал, доступа нет.
        </p>
      </div>
    </Modal>
  );
}
