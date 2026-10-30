"use client";

/**
 * «Мой аккаунт» (route "/account") — собственная учётка вошедшего админа, для всех: профиль, пароль,
 * 2FA (статус + «Перенастроить»), доверенные устройства, последние 20 входов и «Выйти на всех устройствах».
 */
import { History } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { PanelHeader } from "@/components/ui/PanelHeader";
import { QueryState } from "@/components/ui/QueryState";
import { useAccountQuery, useLoginsQuery } from "../queries";
import { DevicesPanel } from "./account/DevicesPanel";
import { LoginHistory } from "./account/LoginHistory";
import { PasswordPanel } from "./account/PasswordPanel";
import { ProfilePanel } from "./account/ProfilePanel";
import { TwoFactorPanel } from "./account/TwoFactorPanel";

export function AccountScreen() {
  const accountQ = useAccountQuery();
  const loginsQ = useLoginsQuery();
  const account = accountQ.data;

  return (
    <div className="min-w-0">
      <PageHeader title="Мой аккаунт" subtitle="Пароль, двухфакторная защита, устройства и история входов." />
      <QueryState isLoading={accountQ.isLoading} isError={accountQ.isError} error={accountQ.error} refetch={accountQ.refetch}>
        {account && (
          <div className="grid min-w-0 gap-4 xl:grid-cols-2">
            <ProfilePanel account={account} />
            <TwoFactorPanel account={account} />
            <PasswordPanel account={account} />
            <DevicesPanel account={account} />
            <section className="panel min-w-0 p-5 xl:col-span-2">
              <PanelHeader icon={History} title="История входов" description="Последние 20 попыток входа в вашу учётку — удачных и нет. Хранится 90 дней." />
              <QueryState isLoading={loginsQ.isLoading} isError={loginsQ.isError} error={loginsQ.error} refetch={loginsQ.refetch}>
                <LoginHistory entries={loginsQ.data ?? []} />
              </QueryState>
            </section>
          </div>
        )}
      </QueryState>
    </div>
  );
}
