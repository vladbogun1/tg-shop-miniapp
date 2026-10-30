"use client";

/**
 * «Админы» (route "/admins") — только для главного админа (SUPER_ADMIN): кто входит в админку,
 * приглашения и что можно сделать с другим админом. Остальным скрыт в меню; бэкенд там отвечает 403.
 * Свою учётку здесь не трогаем — это «Мой аккаунт».
 */
import { Button } from "@shop/ui/admin-button";
import { ShieldAlert, UserPlus } from "lucide-react";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { QueryState } from "@/components/ui/QueryState";
import { CenterSpinner } from "@/components/ui/Spinner";
import { teamRows } from "../model/team-rows";
import { useIsSuperAdmin, useTeamQuery, type LinkToShow } from "../queries";
import { InviteModal } from "./InviteModal";
import { LinkModal } from "./LinkModal";
import { TeamList } from "./TeamList";
import { useAdminActions } from "./use-admin-actions";

export function AdminsScreen() {
  const superAdmin = useIsSuperAdmin();
  if (superAdmin === undefined) return <CenterSpinner label="Загрузка…" />;
  if (!superAdmin) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="Только для главного админа"
        description="Управлять админами может только главный админ. Свой пароль и 2FA — в «Мой аккаунт»."
      />
    );
  }
  return <Team />;
}

function Team() {
  const teamQ = useTeamQuery();
  const [inviting, setInviting] = useState<{ telegramUserId?: number } | null>(null);
  const [link, setLink] = useState<LinkToShow | null>(null);
  const actions = useAdminActions(setLink, (id) => setInviting({ telegramUserId: id }));
  const rows = useMemo(() => (teamQ.data ? teamRows(teamQ.data) : []), [teamQ.data]);

  return (
    <div className="min-w-0">
      <PageHeader
        title="Админы"
        subtitle="Кто входит в админку. Приглашения, сброс 2FA и пароля, блокировка. Свою учётку — в «Мой аккаунт»."
        actions={
          <Button variant="accent" icon={<UserPlus className="h-4 w-4" />} onClick={() => setInviting({})}>
            Пригласить админа
          </Button>
        }
      />
      <QueryState isLoading={teamQ.isLoading} isError={teamQ.isError} error={teamQ.error} refetch={teamQ.refetch} loadingLabel="Загружаем админов">
        <TeamList rows={rows} itemsFor={actions.itemsFor} askFinance={actions.askFinance} />
      </QueryState>

      {inviting && (
        <InviteModal
          initialTelegramId={inviting.telegramUserId}
          admins={teamQ.data?.admins ?? []}
          onClose={() => setInviting(null)}
          onCreated={(created, who) => {
            setInviting(null);
            if (!created.delivered) setLink({ created, who });
          }}
        />
      )}
      {link && <LinkModal link={link} onClose={() => setLink(null)} />}
      {actions.ui}
    </div>
  );
}
