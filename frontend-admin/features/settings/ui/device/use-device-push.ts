"use client";

import { useApiMutation } from "@shop/ui/mutation";
import { toast } from "@shop/ui/toast";
import { useCallback, useEffect, useState } from "react";
import { iosVersion, isIos, swEnabled, usePwa } from "@/lib/pwa";
import { currentSubscription, disablePush, enablePush, pushApi, pushPermission, pushSupported, type PushPermission } from "@/features/notification";
import { settingsKeys } from "../../keys";
import { usePushConfig } from "../../queries";

/** Состояние push на ЭТОМ устройстве + включение/выключение и тест. */
export function useDevicePush() {
  const pwa = usePwa();
  const configQ = usePushConfig();
  const config = configQ.data;
  const [mounted, setMounted] = useState(false);
  const [permission, setPermission] = useState<PushPermission>("unsupported");
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [endpoint, setEndpoint] = useState<string | null>(null);

  const refreshLocal = useCallback(async () => {
    setPermission(pushPermission());
    const sub = await currentSubscription();
    setSubscribed(!!sub);
    setEndpoint(sub?.endpoint ?? null);
  }, []);

  useEffect(() => {
    setMounted(true);
    void refreshLocal();
  }, [refreshLocal]);

  const toggleM = useApiMutation({
    mutationFn: async (on: boolean) => {
      if (on) await enablePush(config?.publicKey ?? "");
      else await disablePush();
      return on;
    },
    success: (on) => (on ? "Уведомления включены на этом устройстве" : "Уведомления на этом устройстве выключены"),
    toastOnError: false,
    onError: (e) => toast.error(e instanceof Error ? e.message : "Не удалось изменить уведомления"),
    invalidate: [settingsKeys.pushConfig()],
  });
  const testM = useApiMutation({
    mutationFn: () => pushApi.test(endpoint),
    errorFallback: "Не удалось отправить тест",
    onSuccess: async (r) => {
      if (r.sent > 0) toast.success("Тест отправлен — уведомление придёт через пару секунд");
      else if (r.removed > 0) {
        toast.error("Подписка устарела — включите уведомления заново");
        await refreshLocal();
      } else toast.error("Push-сервис не принял уведомление — попробуйте позже");
    },
  });

  const ios = isIos();
  const iosV = iosVersion();
  // iPhone: Push API есть только внутри установленного (с экрана «Домой») приложения.
  const iosNeedsInstall = ios && !pwa.standalone;
  const serverOn = !!config?.enabled && !!config.publicKey;
  const supported = pushSupported() && swEnabled;

  return {
    mounted,
    configLoading: configQ.isLoading,
    devices: config?.devices ?? 0,
    permission,
    subscribed,
    ios,
    iosTooOld: ios && iosV !== null && iosV < 16.4,
    iosNeedsInstall,
    serverOn,
    canToggle: supported && serverOn && !iosNeedsInstall && permission !== "denied",
    busy: toggleM.isPending ? ("toggle" as const) : testM.isPending ? ("test" as const) : null,
    toggle(on: boolean) {
      if (!config?.publicKey) return;
      toggleM.mutate(on, { onSettled: () => void refreshLocal() });
    },
    test: () => testM.mutate(),
  };
}

export type DevicePush = ReturnType<typeof useDevicePush>;
