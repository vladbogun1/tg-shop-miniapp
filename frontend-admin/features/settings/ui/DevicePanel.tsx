"use client";

/**
 * «Приложение и уведомления» — только это устройство: установить админку приложением, включить/выключить
 * push, отправить тест, понять, почему здесь они не заработают (iPhone вне установленного приложения,
 * запрещено в браузере, на сервере нет ключей).
 */
import { Smartphone } from "lucide-react";
import { PanelHeader } from "@/components/ui/PanelHeader";
import { InstallBlock } from "./device/InstallBlock";
import { PushBlock } from "./device/PushBlock";
import { useDevicePush } from "./device/use-device-push";

export function DevicePanel() {
  const push = useDevicePush();
  if (!push.mounted) return null;
  return (
    <section className="panel min-w-0 p-5">
      <PanelHeader
        icon={Smartphone}
        title="Приложение и уведомления"
        description="Только для этого устройства: телефона или компьютера, с которого вы сейчас зашли."
      />
      <InstallBlock />
      <PushBlock p={push} />
    </section>
  );
}
