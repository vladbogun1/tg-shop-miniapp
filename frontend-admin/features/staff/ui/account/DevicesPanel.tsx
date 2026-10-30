"use client";

import { Button } from "@shop/ui/admin-button";
import { useConfirm } from "@shop/ui/confirm";
import { Laptop, MonitorX, ShieldAlert } from "lucide-react";
import { PanelHeader } from "@/components/ui/PanelHeader";
import type { AdminAccount } from "../../api";
import { useForgetOwnDevices, useLogoutEverywhere } from "../../queries";
import { Row } from "./Row";

const LOGOUT_TEXT = {
  message: "Все сессии, включая эту, будут завершены, доверенные устройства — забыты. Войти придётся заново везде.",
  confirmLabel: "Выйти везде",
  failText: "Не удалось выйти на всех устройствах",
};

export function DevicesPanel({ account }: { account: AdminAccount }) {
  const confirm = useConfirm();
  const forgetM = useForgetOwnDevices();
  const logoutAll = useLogoutEverywhere(LOGOUT_TEXT);

  async function forget() {
    const ok = await confirm({
      title: "Забыть все устройства?",
      message: "На всех доверенных устройствах, включая это, при следующем входе снова понадобится код из приложения.",
      confirmLabel: "Забыть все",
      danger: true,
    });
    if (ok) forgetM.mutate();
  }

  return (
    <section className="panel min-w-0 p-5">
      <PanelHeader icon={Laptop} title="Устройства и сессии" description={`Доверенное устройство не спрашивает код ${account.trustedDeviceDays} дней.`} />
      <div className="mb-4 flex flex-col">
        <Row label="Доверенных устройств">{account.trustedDevices}</Row>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Button variant="surface" icon={<ShieldAlert className="h-4 w-4" />} loading={forgetM.isPending} disabled={account.trustedDevices === 0} onClick={() => void forget()}>
          Забыть все устройства
        </Button>
        <Button variant="danger" icon={<MonitorX className="h-4 w-4" />} loading={logoutAll.busy} onClick={() => void logoutAll.run()}>
          Выйти на всех устройствах
        </Button>
      </div>
    </section>
  );
}
