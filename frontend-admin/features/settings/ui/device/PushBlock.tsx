"use client";

import { Button } from "@shop/ui/admin-button";
import { BellOff, BellRing, Send, Smartphone, TriangleAlert } from "lucide-react";
import { Toggle } from "@/components/ui/Toggle";
import { cn } from "@/lib/cn";
import { swEnabled } from "@/lib/pwa";
import { badgeSupported, pushSupported, type PushPermission } from "@/features/notification";
import { Note, Row } from "./parts";
import type { DevicePush } from "./use-device-push";

const PERMISSION_LABEL: Record<PushPermission, string> = {
  granted: "разрешены",
  denied: "запрещены",
  default: "ещё не спрашивали",
  unsupported: "не поддерживаются",
};

const warnIcon = <TriangleAlert className="h-4 w-4 text-[var(--danger-ink)]" />;

function statusRows(p: DevicePush) {
  return (
    <div className="mb-3">
      <Row
        label="На сервере"
        value={p.configLoading ? "…" : p.serverOn ? "включены" : "не настроены"}
        tone={p.configLoading ? "muted" : p.serverOn ? "ok" : "warn"}
      />
      <Row
        label="Разрешение"
        value={p.iosNeedsInstall ? "только в приложении" : PERMISSION_LABEL[p.permission]}
        tone={p.permission === "granted" ? "ok" : p.permission === "denied" ? "warn" : "muted"}
      />
      <Row label="Это устройство" value={p.subscribed === null ? "…" : p.subscribed ? "подписано" : "не подписано"} tone={p.subscribed ? "ok" : "muted"} />
      {p.serverOn && <Row label="Всего ваших устройств" value={p.devices} />}
      {badgeSupported() && <Row label="Число на иконке" value="= «Внимание»" />}
    </div>
  );
}

/** Почему уведомления здесь не заработают (по одной причине на плашку). */
function Blockers({ p }: { p: DevicePush }) {
  return (
    <>
      {!p.serverOn && !p.configLoading && (
        <Note icon={warnIcon} warn>
          На сервере не заданы VAPID-ключи (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT) — push выключен.
        </Note>
      )}
      {p.iosTooOld && (
        <Note icon={warnIcon} warn>
          Для уведомлений нужна iOS 16.4 или новее. Обновите iPhone в «Настройки → Основные → Обновление ПО».
        </Note>
      )}
      {p.iosNeedsInstall && !p.iosTooOld && (
        <Note icon={<Smartphone className="h-4 w-4" />}>
          На iPhone уведомления работают <b className="text-[var(--text)]">только в установленном приложении</b>: сначала
          «На экран Домой», затем откройте админку с иконки и включите уведомления здесь.
        </Note>
      )}
      {!p.ios && !pushSupported() && <Note icon={<BellOff className="h-4 w-4" />}>Этот браузер не поддерживает push-уведомления.</Note>}
      {pushSupported() && !swEnabled && (
        <Note icon={<BellOff className="h-4 w-4" />}>Сервис-воркер работает только в собранной версии админки (не в режиме разработки).</Note>
      )}
      {p.permission === "denied" && !p.iosNeedsInstall && (
        <Note icon={<BellOff className="h-4 w-4 text-[var(--danger-ink)]" />} warn>
          Уведомления запрещены для этого сайта.{" "}
          {p.ios
            ? "Включите их: Настройки iPhone → Уведомления → ChiSetup Admin."
            : "Включите их в настройках сайта (значок замка в адресной строке) или в настройках приложения на телефоне."}
        </Note>
      )}
    </>
  );
}

export function PushBlock({ p }: { p: DevicePush }) {
  return (
    <div className="mt-5 border-t border-[var(--line)] pt-4">
      <h3 className="section-title mb-2">Уведомления на этом устройстве</h3>
      <p className="mb-3 text-[12px] leading-relaxed text-[var(--text-muted)]">
        Новый заказ, онлайн-оплата заказа, сообщение клиента в чате, сбой обновления сайта. Нажатие открывает заказ, чат или «Внимание».
      </p>
      {statusRows(p)}
      <div className="flex flex-col gap-3">
        <Blockers p={p} />
        <div className={cn("rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] p-3", !p.canToggle && "opacity-60")}>
          <Toggle
            checked={!!p.subscribed}
            disabled={!p.canToggle || p.busy !== null}
            onChange={p.toggle}
            label={p.busy === "toggle" ? "Подождите…" : "Получать уведомления"}
          />
        </div>
        <Button
          variant="outline"
          icon={p.subscribed ? <Send className="h-4 w-4" /> : <BellRing className="h-4 w-4" />}
          loading={p.busy === "test"}
          disabled={!p.subscribed || !p.serverOn || p.busy !== null}
          onClick={p.test}
          className="w-full sm:w-auto sm:self-start"
        >
          Отправить тест
        </Button>
      </div>
    </div>
  );
}
