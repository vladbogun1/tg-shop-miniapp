"use client";

import { Button } from "@shop/ui/admin-button";
import { Link2Off } from "lucide-react";
import { StepHeader } from "../auth/parts";

export function DeadLink({ message }: { message: string }) {
  return (
    <div>
      <StepHeader icon={<Link2Off className="h-4 w-4" />} title="Ссылка не действует" subtitle={message} />
      <p className="text-center text-[13px] leading-relaxed text-[var(--text-muted)]">
        Ссылки-приглашения одноразовые и действуют 48 часов. Попросите главного админа нажать «Отправить заново».
      </p>
      <Button variant="ghost" className="mx-auto mt-5 flex" onClick={() => window.location.replace("/")}>
        На страницу входа
      </Button>
    </div>
  );
}
