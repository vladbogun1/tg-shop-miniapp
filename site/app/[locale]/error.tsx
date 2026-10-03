"use client";

import { useEffect } from "react";
import { ErrorScreen } from "@/components/errors/ErrorScreen";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return <ErrorScreen code={500} onRetry={reset} />;
}
