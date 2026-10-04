"use client";

/**
 * «Приложение и уведомления» — this device only: install the admin as an app, turn push
 * notifications on/off, send a test, see why they cannot work here (iPhone outside the
 * installed app, permission denied, push not configured on the server).
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BellOff,
  BellRing,
  CheckCircle2,
  Download,
  RefreshCw,
  Send,
  Share,
  Smartphone,
  SquarePlus,
  TriangleAlert,
} from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Toggle } from "@/components/ui/Toggle";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { applyUpdate, iosVersion, isIos, isIosSafari, promptInstall, swEnabled, usePwa } from "@/lib/pwa";
import {
  badgeSupported,
  currentSubscription,
  disablePush,
  enablePush,
  pushApi,
  pushPermission,
  pushSupported,
  type PushPermission,
} from "@/lib/push";
import { useToast } from "@/lib/toast";
import { PanelHeader } from "./PanelHeader";

const PERMISSION_LABEL: Record<PushPermission, string> = {
  granted: "разрешены",
  denied: "запрещены",
  default: "ещё не спрашивали",
  unsupported: "не поддерживаются",
};

function Row({ label, value, tone }: { label: string; value: ReactNode; tone?: "ok" | "warn" | "muted" }) {
  return (
    <div className="flex min-h-9 items-center justify-between gap-3 border-b-2 border-dashed border-[var(--surface-3)] py-1.5 last:border-b-0">
      <span className="text-[13px] text-[var(--text-muted)]">{label}</span>
      <span
        className={cn(
          "text-right text-[13px] font-bold",
          tone === "ok" && "text-[var(--ok)]",
          tone === "warn" && "text-[var(--danger)]",
          (!tone || tone === "muted") && "text-[var(--text)]"
        )}
      >
        {value}
      </span>
    </div>
  );
}

function Note({ icon, children, warn }: { icon: ReactNode; children: ReactNode; warn?: boolean }) {
  return (
    <div
      className={cn(
        "flex gap-2.5 rounded-[var(--r-md)] border-2 p-3 text-[13px] leading-relaxed",
        warn
          ? "border-[var(--danger)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] text-[var(--text)]"
          : "border-[var(--line)] bg-[var(--surface-2)] text-[var(--text-muted)]"
      )}
    >
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function DevicePanel() {
  const { push } = useToast();
  const qc = useQueryClient();
  const pwa = usePwa();
  const [mounted, setMounted] = useState(false);
  const [permission, setPermission] = useState<PushPermission>("unsupported");
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [busy, setBusy] = useState<"toggle" | "test" | null>(null);

  const configQ = useQuery({ queryKey: ["admin", "push-config"], queryFn: pushApi.config, staleTime: 60_000 });
  const config = configQ.data;

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

  if (!mounted) return null;

  const ios = isIos();
  const iosV = iosVersion();
  const iosTooOld = ios && iosV !== null && iosV < 16.4;
  // iPhone: the Push API exists only inside the installed (home-screen) app.
  const iosNeedsInstall = ios && !pwa.standalone;
  const supported = pushSupported() && swEnabled;
  const serverOn = !!config?.enabled && !!config.publicKey;
  const canToggle = supported && serverOn && !iosNeedsInstall && permission !== "denied";

  async function toggle(on: boolean) {
    if (!config?.publicKey) return;
    setBusy("toggle");
    try {
      if (on) {
        await enablePush(config.publicKey);
        push("Уведомления включены на этом устройстве", "ok");
      } else {
        await disablePush();
        push("Уведомления на этом устройстве выключены", "ok");
      }
    } catch (e) {
      push(e instanceof ApiError || e instanceof Error ? e.message : "Не удалось изменить уведомления", "error");
    } finally {
      await refreshLocal();
      void qc.invalidateQueries({ queryKey: ["admin", "push-config"] });
      setBusy(null);
    }
  }

  async function test() {
    setBusy("test");
    try {
      const r = await pushApi.test(endpoint);
      if (r.sent > 0) push("Тест отправлен — уведомление придёт через пару секунд", "ok");
      else if (r.removed > 0) {
        push("Подписка устарела — включите уведомления заново", "error");
        await refreshLocal();
      } else push("Push-сервис не принял уведомление — попробуйте позже", "error");
    } catch (e) {
      push(e instanceof ApiError ? e.message : "Не удалось отправить тест", "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="panel min-w-0 p-5">
      <PanelHeader
        icon={Smartphone}
        title="Приложение и уведомления"
        description="Только для этого устройства: телефона или компьютера, с которого вы сейчас зашли."
      />

      {/* ---- the app ---- */}
      <div className="flex min-w-0 flex-col gap-3">
        {pwa.standalone ? (
          <Note icon={<CheckCircle2 className="h-4 w-4 text-[var(--ok)]" />}>
            Админка открыта как <b className="text-[var(--text)]">приложение</b>.
          </Note>
        ) : pwa.canInstall ? (
          <Button
            variant="accent"
            icon={<Download className="h-4 w-4" />}
            onClick={() => void promptInstall()}
            className="w-full sm:w-auto sm:self-start"
          >
            Установить приложение
          </Button>
        ) : isIosSafari() ? (
          <Note icon={<SquarePlus className="h-4 w-4" />}>
            <b className="text-[var(--text)]">Установить на iPhone:</b> нажмите{" "}
            <span className="inline-flex translate-y-[2px] items-center gap-1 font-bold text-[var(--text)]">
              <Share className="h-4 w-4" aria-hidden />
              «Поделиться»
            </span>{" "}
            внизу Safari → <b className="text-[var(--text)]">«На экран Домой»</b> → «Добавить». Потом откройте админку с иконки
            и войдите заново (у приложения свой вход).
          </Note>
        ) : ios ? (
          <Note icon={<SquarePlus className="h-4 w-4" />}>
            На iPhone установить админку можно из <b className="text-[var(--text)]">Safari</b>: откройте этот адрес в Safari →
            «Поделиться» → «На экран Домой».
          </Note>
        ) : (
          <Note icon={<Download className="h-4 w-4" />}>
            Установить можно из Chrome или Edge: меню браузера → «Установить приложение» / «Добавить на главный экран».
          </Note>
        )}

        {pwa.updateReady && (
          <Button variant="surface" icon={<RefreshCw className="h-4 w-4" />} onClick={applyUpdate} className="w-full sm:w-auto sm:self-start">
            Обновить приложение
          </Button>
        )}
      </div>

      {/* ---- push ---- */}
      <div className="mt-5 border-t-[3px] border-[var(--line)] pt-4">
        <h3 className="mb-2 text-[13px] font-black uppercase tracking-wide text-[var(--text)]">Уведомления на этом устройстве</h3>
        <p className="mb-3 text-[12px] leading-relaxed text-[var(--text-muted)]">
          Новый заказ, «я оплатил», сообщение клиента в чате, сбой обновления сайта. Нажатие открывает заказ, чат или «Внимание».
        </p>

        <div className="mb-3">
          <Row
            label="На сервере"
            value={configQ.isLoading ? "…" : serverOn ? "включены" : "не настроены"}
            tone={configQ.isLoading ? "muted" : serverOn ? "ok" : "warn"}
          />
          <Row
            label="Разрешение"
            value={iosNeedsInstall ? "только в приложении" : PERMISSION_LABEL[permission]}
            tone={permission === "granted" ? "ok" : permission === "denied" ? "warn" : "muted"}
          />
          <Row
            label="Это устройство"
            value={subscribed === null ? "…" : subscribed ? "подписано" : "не подписано"}
            tone={subscribed ? "ok" : "muted"}
          />
          {serverOn && <Row label="Всего ваших устройств" value={config?.devices ?? 0} />}
          {badgeSupported() && <Row label="Число на иконке" value="= «Внимание»" />}
        </div>

        <div className="flex flex-col gap-3">
          {!serverOn && !configQ.isLoading && (
            <Note icon={<TriangleAlert className="h-4 w-4 text-[var(--danger)]" />} warn>
              На сервере не заданы VAPID-ключи (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT) — push выключен.
            </Note>
          )}
          {iosTooOld && (
            <Note icon={<TriangleAlert className="h-4 w-4 text-[var(--danger)]" />} warn>
              Для уведомлений нужна iOS 16.4 или новее. Обновите iPhone в «Настройки → Основные → Обновление ПО».
            </Note>
          )}
          {iosNeedsInstall && !iosTooOld && (
            <Note icon={<Smartphone className="h-4 w-4" />}>
              На iPhone уведомления работают <b className="text-[var(--text)]">только в установленном приложении</b>: сначала
              «На экран Домой», затем откройте админку с иконки и включите уведомления здесь.
            </Note>
          )}
          {!ios && !pushSupported() && (
            <Note icon={<BellOff className="h-4 w-4" />}>Этот браузер не поддерживает push-уведомления.</Note>
          )}
          {pushSupported() && !swEnabled && (
            <Note icon={<BellOff className="h-4 w-4" />}>
              Сервис-воркер работает только в собранной версии админки (не в режиме разработки).
            </Note>
          )}
          {permission === "denied" && !iosNeedsInstall && (
            <Note icon={<BellOff className="h-4 w-4 text-[var(--danger)]" />} warn>
              Уведомления запрещены для этого сайта.{" "}
              {ios
                ? "Включите их: Настройки iPhone → Уведомления → MAXSOLCH."
                : "Включите их в настройках сайта (значок замка в адресной строке) или в настройках приложения на телефоне."}
            </Note>
          )}

          <div className={cn("rounded-[var(--r-md)] border-[3px] border-[var(--line)] bg-[var(--surface-2)] p-3", !canToggle && "opacity-60")}>
            <Toggle
              checked={!!subscribed}
              disabled={!canToggle || busy !== null}
              onChange={(v) => void toggle(v)}
              label={busy === "toggle" ? "Подождите…" : "Получать уведомления"}
            />
          </div>

          <Button
            variant="outline"
            icon={subscribed ? <Send className="h-4 w-4" /> : <BellRing className="h-4 w-4" />}
            loading={busy === "test"}
            disabled={!subscribed || !serverOn || busy !== null}
            onClick={() => void test()}
            className="w-full sm:w-auto sm:self-start"
          >
            Отправить тест
          </Button>
        </div>
      </div>
    </section>
  );
}
