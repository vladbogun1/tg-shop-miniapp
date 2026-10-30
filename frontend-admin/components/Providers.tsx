"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { AdminConfirmHost } from "@shop/ui/confirm/admin";
import { UiLookProvider } from "@shop/ui/look";
import { Toaster } from "@shop/ui/toast";
import { AuthGate } from "@/components/auth/AuthGate";
import { PwaBoot } from "@/components/pwa/AppRuntime";

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: 1,
        staleTime: 15_000,
        refetchOnWindowFocus: false,
      },
    },
  });
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(makeClient);
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
