"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { buildMutationOptions, newGuard, type ApiMutationConfig } from "./api-mutation";

/**
 * Единственный способ записи на сервер из экрана. `isPending` — для `disabled`/`loading` кнопки
 * (второе нажатие в полёте всё равно игнорируется). Ошибка → тост, успех → тост и invalidate по конфигурации.
 */
export function useApiMutation<TData, TVars = void>(config: ApiMutationConfig<TData, TVars>) {
  const qc = useQueryClient();
  const [guard] = useState(newGuard);
  return useMutation(buildMutationOptions(qc, config, guard));
}
