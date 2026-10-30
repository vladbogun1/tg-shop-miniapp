import { UserRound } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { PanelHeader } from "@/components/ui/PanelHeader";
import type { AdminAccount } from "../../api";
import { Row } from "./Row";

export function ProfilePanel({ account }: { account: AdminAccount }) {
  return (
    <section className="panel min-w-0 p-5">
      <PanelHeader icon={UserRound} title="Профиль" description="Кто вы в админке. Имя и роль меняет главный админ в разделе «Админы»." />
      <div className="flex flex-col">
        <Row label="Имя">{account.name || "—"}</Row>
        <Row label="Логин">{account.username || "нет (вход только через Telegram)"}</Row>
        <Row label="Роль">
          <Badge tone={account.superAdmin ? "accent" : "neutral"}>{account.superAdmin ? "Главный админ" : "Админ"}</Badge>
        </Row>
        <Row label="Telegram ID">{account.telegramUserId}</Row>
      </div>
    </section>
  );
}
