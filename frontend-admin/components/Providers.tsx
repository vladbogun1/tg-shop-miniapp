"use client";

import { makeQueryClient } from "@shop/core/query";
import { AdminConfirmHost } from "@shop/ui/confirm/admin";
import { UiLookProvider } from "@shop/ui/look";
import { Toaster } from "@shop/ui/toast";
import { QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { PwaBoot } from "@/components/pwa/AppRuntime";
import { AuthGate } from "@/shell";

/** Админка обновляет списки чаще витрины: 15 с вместо 30. */
const ADMIN_STALE_MS = 15_000;

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => makeQueryClient({ staleTime: ADMIN_STALE_MS }));
  return (
    <QueryClientProvider client={client}>
      <PwaBoot />
      <UiLookProvider look="admin">
        <AuthGate>{children}</AuthGate>
        <Toaster />
        <AdminConfirmHost />
      </UiLookProvider>
    </QueryClientProvider>
  );
}
