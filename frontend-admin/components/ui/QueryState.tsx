"use client";

import { AlertTriangle, Lock, RotateCw } from "lucide-react";
import type { ReactNode } from "react";
import { ApiError, isForbidden } from "@/lib/api";
import { Button } from "./Button";
import { EmptyState } from "./EmptyState";
import { CenterSpinner } from "./Spinner";

/**
 * Loading / error gate for a react-query result. Use it instead of `isLoading ? <Spinner/> : …`:
 * a failed request must show the error and a retry, never an endless spinner or a fake
 * "nothing here" (an empty dispatch list on a failed fetch reads as "everything is shipped").
 */
export function QueryState({
  isLoading,
  isError,
  error,
  refetch,
  loadingLabel,
  children,
}: {
  isLoading: boolean;
  isError: boolean;
  error?: unknown;
  refetch?: () => unknown;
  loadingLabel?: string;
  children: ReactNode;
}) {
  if (isError && isForbidden(error)) {
    // 403: signed in, but this section is not for this admin — no «Повторить», it will not change.
    return (
      <EmptyState
        icon={Lock}
        title="Недостаточно прав"
        description="У вашей учётной записи нет доступа к этому разделу. Если он нужен — попросите главного админа."
      />
    );
  }
  if (isError) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="Не удалось загрузить"
        description={error instanceof ApiError ? error.message : "Сервер не ответил. Проверьте связь и попробуйте ещё раз."}
        action={
          refetch && (
            <Button variant="accent" icon={<RotateCw className="h-4 w-4" />} onClick={() => refetch()}>
              Повторить
            </Button>
          )
        }
      />
    );
  }
  if (isLoading) return <CenterSpinner label={loadingLabel} />;
  return <>{children}</>;
}
