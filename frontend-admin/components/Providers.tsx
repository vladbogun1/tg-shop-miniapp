"use client";

/**
 * App-wide providers: TanStack Query + toast + auth gate.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { ToastProvider } from "@/lib/toast";
import { AuthGate } from "@/components/auth/AuthGate";

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
      <ToastProvider>
        <AuthGate>{children}</AuthGate>
      </ToastProvider>
    </QueryClientProvider>
  );
}
