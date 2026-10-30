"use client";

import { useConfirm } from "@shop/ui/confirm";
import { Ban, KeyRound, Laptop, LockOpen, MailPlus, Pencil, Send, ShieldOff, Trash2, X } from "lucide-react";
import { useCallback, useState } from "react";
import { teamApi, type TeamAdmin } from "../api";
import { adminName, inviteName } from "../model/roles";
import type { TeamRow } from "../model/team-rows";
import { useTeamLinkActions, type CodeAsk, type LinkToShow } from "../queries";
import { CodeConfirmModal } from "./CodeConfirmModal";
import { EditAdminModal } from "./EditAdminModal";
import type { MenuItem } from "./RowMenu";

export interface AdminActions {
  itemsFor: (row: TeamRow) => MenuItem[];
  askFinance: (admin: TeamAdmin, on: boolean) => void;
  /** Модалки, которые открывают действия (код из приложения, имя и роль). */
  ui: React.ReactNode;
}

const ico = "h-4 w-4";

/** Действия меню «⋯»: без кода — через `useTeamLinkActions`, опасные — через `CodeAsk` и модалку с кодом. */
export function useAdminActions(showLink: (l: LinkToShow) => void, inviteExisting: (telegramUserId: number) => void): AdminActions {
  const confirm = useConfirm();
  const [ask, setAsk] = useState<CodeAsk | null>(null);
  const [editing, setEditing] = useState<TeamAdmin | null>(null);
  const { resend, revoke, forgetDevices } = useTeamLinkActions(showLink);

  const itemsFor = useCallback(
    (row: TeamRow): MenuItem[] => {
      const inviteItems = (invite: { id: number; name?: string | null; telegramUserId: number }, who: string, labels: {
        resend: string;
        revoke: string;
        confirmResend: boolean;
        revokeTitle: string;
        revokeDone: string;
        danger: boolean;
      }): MenuItem[] => [
        {
          key: "resend",
          label: labels.resend,
          icon: <Send className={ico} />,
          onSelect: async () => {
            if (
              labels.confirmResend &&
              !(await confirm({
                title: "Отправить приглашение заново?",
                message: "Будет создана новая ссылка на 48 часов, старая перестанет работать.",
                confirmLabel: "Отправить",
              }))
            )
              return;
            resend.mutate({ id: invite.id, who });
          },
        },
        {
          key: "revoke",
          label: labels.revoke,
          icon: <X className={ico} />,
          danger: labels.danger,
          onSelect: async () => {
            if (
              !(await confirm({
                title: labels.revokeTitle,
                message: `Ссылка для «${who}» перестанет работать.`,
                confirmLabel: "Отозвать",
                danger: labels.danger,
              }))
            )
              return;
            revoke.mutate({ id: invite.id, success: labels.revokeDone });
          },
        },
      ];

      if (row.type === "invite") {
        return inviteItems(row.invite, inviteName(row.invite), {
          resend: "Отправить заново",
          revoke: "Отозвать приглашение",
          confirmResend: true,
          revokeTitle: "Отозвать приглашение?",
          revokeDone: "Приглашение отозвано",
          danger: true,
        });
      }

      const a = row.admin;
      const who = adminName(a);
      const id = a.telegramUserId;
      const items: MenuItem[] = [];
      if (a.invite) {
        items.push(
          ...inviteItems(a.invite, who, {
            resend: "Отправить ссылку заново",
            revoke: "Отозвать ссылку",
            confirmResend: false,
            revokeTitle: "Отозвать ссылку?",
            revokeDone: "Ссылка отозвана",
            danger: false,
          }),
        );
      }
      if (!a.active) {
        items.push({
          key: "unblock",
          label: "Разблокировать",
          icon: <LockOpen className={ico} />,
          onSelect: () =>
            setAsk({
              title: `Разблокировать «${who}»?`,
              message: "Админ снова сможет войти — паролем или через Telegram, с кодом из приложения.",
              confirmLabel: "Разблокировать",
              run: (code) => teamApi.unblock(id, code),
              success: `«${who}» разблокирован`,
            }),
        });
      } else {
        items.push({ key: "edit", label: "Имя и роль", icon: <Pencil className={ico} />, onSelect: () => setEditing(a) });
        if (!a.username) {
          items.push({ key: "login", label: "Выдать логин и пароль", icon: <MailPlus className={ico} />, onSelect: () => inviteExisting(id) });
        } else {
          items.push({
            key: "password",
            label: a.passwordSet ? "Сбросить пароль" : "Новая ссылка на пароль",
            icon: <KeyRound className={ico} />,
            onSelect: () =>
              setAsk({
                title: `Сбросить пароль «${who}»?`,
                message:
                  "Старый пароль перестанет работать сразу, все сессии завершатся. Бот пришлёт админу ссылку, чтобы задать новый (если не сможет — ссылка появится здесь).",
                confirmLabel: "Сбросить пароль",
                danger: true,
                run: (code) => teamApi.resetPassword(id, code),
                success: "Пароль сброшен, ссылка отправлена в Telegram",
                linkFor: who,
              }),
          });
        }
        items.push({
          key: "2fa",
          label: "Сбросить 2FA",
          icon: <ShieldOff className={ico} />,
          onSelect: () =>
            setAsk({
              title: `Сбросить 2FA у «${who}»?`,
              message: (
                <>
                  Для потерянного телефона. Все сессии и доверенные устройства админа завершатся; при следующем входе он заново
                  подключит приложение-аутентификатор. Пока он этого не сделал, первым настроить 2FA может любой, кто знает его пароль.
                </>
              ),
              confirmLabel: "Сбросить 2FA",
              danger: true,
              run: (code) => teamApi.resetTwoFactor(id, code),
              success: "2FA сброшена, сессии завершены",
            }),
        });
        items.push({
          key: "devices",
          label: "Забыть устройства",
          icon: <Laptop className={ico} />,
          onSelect: async () => {
            if (!(await confirm({ title: `Забыть устройства «${who}»?`, message: "На всех доверенных устройствах админа снова будет спрашиваться код.", confirmLabel: "Забыть" }))) return;
            forgetDevices.mutate(id);
          },
        });
        items.push({
          key: "block",
          label: "Заблокировать",
          icon: <Ban className={ico} />,
          danger: true,
          onSelect: () =>
            setAsk({
              title: `Заблокировать «${who}»?`,
              message: "Админ сразу выйдет на всех устройствах и не сможет войти ни паролем, ни через Telegram. История его действий сохранится.",
              confirmLabel: "Заблокировать",
              danger: true,
              run: (code) => teamApi.block(id, code),
              success: `«${who}» заблокирован`,
            }),
        });
      }
      items.push({
        key: "delete",
        label: "Удалить",
        icon: <Trash2 className={ico} />,
        danger: true,
        onSelect: () =>
          setAsk({
            title: `Удалить «${who}»?`,
            message: "Можно только если админ ничего не делал в магазине (журнал, чаты заказов, рассылки). Иначе — заблокируйте: история останется с его именем.",
            confirmLabel: "Удалить",
            danger: true,
            run: (code) => teamApi.remove(id, code),
            success: `«${who}» удалён`,
          }),
      });
      return items;
    },
    [confirm, forgetDevices, inviteExisting, resend, revoke],
  );

  const askFinance = useCallback(
    (a: TeamAdmin, on: boolean) =>
      setAsk({
        title: on ? `Включить «Финансы» для «${adminName(a)}»?` : `Выключить «Финансы» у «${adminName(a)}»?`,
        message: on
          ? "Админ увидит цены закупки, расходы поставок, себестоимость, прибыль и маржу заказов."
          : "Админ перестанет видеть закупку, себестоимость, прибыль и маржу.",
        confirmLabel: on ? "Включить" : "Выключить",
        run: (code) => teamApi.setFinance(a.telegramUserId, on, code),
        success: on ? "«Финансы» включены" : "«Финансы» выключены",
      }),
    [],
  );

  const ui = (
    <>
      {ask && <CodeConfirmModal ask={ask} onClose={() => setAsk(null)} onLink={showLink} />}
      {editing && <EditAdminModal admin={editing} onClose={() => setEditing(null)} />}
    </>
  );
  return { itemsFor, askFinance, ui };
}
