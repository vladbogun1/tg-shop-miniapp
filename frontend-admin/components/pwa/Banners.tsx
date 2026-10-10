"use client";

/**
 * Install / update prompts of the admin app.
 *  - UpdateBanner: a new version is downloaded — «Обновить приложение» (nothing reloads by itself).
 *  - InstallBanner (phones, in the browser only): Android — Chrome's install dialog behind our
 *    button; iPhone Safari — how to add it to the home screen. «×» hides it for good; the same
 *    actions stay in «Настройки → Приложение».
 *  - PushOfferBanner: renews this device's push subscription; offers «Включить уведомления» when
 *    there is none (e.g. after «Выйти везде»), «Позже» snoozes it on this device.
 */
import { AnimatePresence, motion } from "framer-motion";
import { BellRing, Download, RefreshCw, Share, SquarePlus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import {
  applyUpdate,
  dismissInstallHint,
  installHintDismissed,
  isIos,
  isIosSafari,
  isStandalone,
  promptInstall,
  swEnabled,
  usePwa,
} from "@/lib/pwa";
import {
  currentSubscription,
  enablePush,
  pushApi,
  pushOfferSnoozed,
  pushPermission,
  pushSupported,
  snoozePushOffer,
  syncPush,
} from "@/lib/push";
import { useToast } from "@/lib/toast";

export function UpdateBanner() {
  const { updateReady } = usePwa();
  const [busy, setBusy] = useState(false);
  return (
    <AnimatePresence>
      {updateReady && (
        <motion.div
          role="status"
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 24, opacity: 0 }}
          transition={{ type: "spring", stiffness: 380, damping: 32 }}
          className="elevated fixed inset-x-3 z-[350] mx-auto flex max-w-md flex-wrap items-center gap-x-3 gap-y-2.5 !border-[rgba(255,102,0,.45)] p-3 lg:left-auto lg:right-6"
          style={{ bottom: "calc(var(--bottom-nav) + 12px)" }}
        >
          <RefreshCw className="h-5 w-5 shrink-0 text-[var(--accent)]" aria-hidden />
          <div className="min-w-[10rem] flex-1 text-[13px] font-semibold leading-snug text-[var(--text)]">
            Вышла новая версия админки
            <span className="block text-[12px] font-normal text-[var(--text-muted)]">Сначала сохраните то, что редактируете</span>
          </div>
          <Button
            variant="accent"
            size="sm"
            loading={busy}
            className="h-11 w-full shrink-0 sm:w-auto"
            onClick={() => {
              setBusy(true);
              applyUpdate();
            }}
          >
            Обновить приложение
          </Button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function InstallBanner() {
  const { canInstall, standalone } = usePwa();
  const [mounted, setMounted] = useState(false);
  const [hidden, setHidden] = useState(true);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    setMounted(true);
    setIos(isIosSafari());
    // Phones only: on a computer the install button lives in the settings.
    const phone = window.matchMedia("(pointer: coarse)").matches && window.innerWidth < 1024;
    setHidden(!phone || installHintDismissed());
  }, []);

  if (!mounted || hidden || standalone || (!canInstall && !ios)) return null;

  function close() {
    dismissInstallHint();
    setHidden(true);
  }

  return (
    <div className="card mb-4 flex items-start gap-3 p-3.5" data-app-chrome>
      <div className="accent-tint grid h-10 w-10 shrink-0 place-items-center rounded-[var(--r-md)]">
        {ios ? <SquarePlus className="h-5 w-5" /> : <Download className="h-5 w-5" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-display text-[14px] font-bold uppercase tracking-[0.04em] text-[var(--ink)]">Админка как приложение</div>
        {ios ? (
          <p className="mt-1 text-[13px] leading-relaxed text-[var(--text-muted)]">
            Нажмите{" "}
            <span className="inline-flex translate-y-[2px] items-center gap-1 font-bold text-[var(--text)]">
              <Share className="h-4 w-4" aria-hidden /> «Поделиться»
            </span>{" "}
            внизу Safari, затем <b className="text-[var(--text)]">«На экран Домой»</b>. Так приходят уведомления о заказах.
          </p>
        ) : (
          <>
            <p className="mt-1 text-[13px] leading-relaxed text-[var(--text-muted)]">
              Иконка на экране, запуск без браузера и уведомления о заказах.
            </p>
            <Button
              variant="accent"
              size="sm"
              className="mt-2.5 h-10"
              icon={<Download className="h-4 w-4" />}
              onClick={() => void promptInstall()}
            >
              Установить
            </Button>
          </>
        )}
      </div>
      <button
        type="button"
        onClick={close}
        aria-label="Скрыть подсказку"
        className="hit -mr-1 -mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-[var(--r-sm)] text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
      >
        <X className="h-5 w-5" />
      </button>
    </div>
  );
}

/**
 * «Включить уведомления» on this device. Renews a live subscription silently (the server may have
 * dropped it); when there is none — never enabled here, or «Выйти везде» / password change / 2FA
 * reset removed every subscription of the admin — offers to turn push on. «Позже» hides the offer
 * on this device for a month (lib/push.ts); the same switch lives in «Настройки → Приложение».
 * Not shown where push cannot work: no Push API, iPhone outside the installed app, permission
 * denied, push not configured on the server.
 */
export function PushOfferBanner() {
  const { push } = useToast();
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const subscribed = await syncPush();
      if (cancelled || subscribed || pushOfferSnoozed()) return;
      if (!swEnabled || !pushSupported() || pushPermission() === "denied") return;
      if (isIos() && !isStandalone()) return;
      if (await currentSubscription()) return;
      const config = await pushApi.config().catch(() => null);
      if (!cancelled && config?.enabled && config.publicKey) setPublicKey(config.publicKey);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function later() {
    snoozePushOffer();
    setPublicKey(null);
  }

  async function enable() {
    if (!publicKey) return;
    setBusy(true);
    try {
      await enablePush(publicKey);
      push("Уведомления включены на этом устройстве", "ok");
      setPublicKey(null);
    } catch (e) {
      push(e instanceof Error ? e.message : "Не удалось включить уведомления", "error");
      // Refused in the browser's own dialog: asking again here is pointless.
      if (pushPermission() === "denied") later();
    } finally {
      setBusy(false);
    }
  }

  if (!publicKey) return null;

  return (
    <div className="card mb-4 flex items-start gap-3 p-3.5" data-app-chrome role="status">
      <div className="accent-tint grid h-10 w-10 shrink-0 place-items-center rounded-[var(--r-md)]">
        <BellRing className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-display text-[14px] font-bold uppercase tracking-[0.04em] text-[var(--ink)]">
          Уведомления выключены
        </div>
        <p className="mt-1 text-[13px] leading-relaxed text-[var(--text-muted)]">
          На этом устройстве не приходят push о новых заказах и сообщениях в чатах.
        </p>
        <div className="mt-2.5 flex flex-wrap gap-2">
          <Button
            variant="accent"
            size="sm"
            className="h-10"
            loading={busy}
            icon={<BellRing className="h-4 w-4" />}
            onClick={() => void enable()}
          >
            {/* Narrow phones: the text column is ~160px — the full label would stick out of the card. */}
            Включить<span className="max-[399px]:hidden">&nbsp;уведомления</span>
          </Button>
          <Button variant="ghost" size="sm" className="h-10" onClick={later} disabled={busy}>
            Позже
          </Button>
        </div>
      </div>
      <button
        type="button"
        onClick={later}
        aria-label="Скрыть"
        className="hit -mr-1 -mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-[var(--r-sm)] text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
      >
        <X className="h-5 w-5" />
      </button>
    </div>
  );
}
