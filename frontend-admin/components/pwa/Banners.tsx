"use client";

/**
 * Install / update prompts of the admin app.
 *  - UpdateBanner: a new version is downloaded — «Обновить приложение» (nothing reloads by itself).
 *  - InstallBanner (phones, in the browser only): Android — Chrome's install dialog behind our
 *    button; iPhone Safari — how to add it to the home screen. «×» hides it for good; the same
 *    actions stay in «Настройки → Приложение».
 */
import { AnimatePresence, motion } from "framer-motion";
import { Download, RefreshCw, Share, SquarePlus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import {
  applyUpdate,
  dismissInstallHint,
  installHintDismissed,
  isIosSafari,
  promptInstall,
  usePwa,
} from "@/lib/pwa";

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
          className="fixed inset-x-3 z-[350] mx-auto flex max-w-md items-center gap-3 rounded-[var(--r-md)] border-[3px] border-[var(--line)] bg-[var(--c3)] p-3 shadow-[5px_5px_0_var(--shadow)] lg:left-auto lg:right-6"
          style={{ bottom: "calc(var(--bottom-nav) + 12px)" }}
        >
          <RefreshCw className="h-5 w-5 shrink-0" aria-hidden />
          <div className="min-w-0 flex-1 text-[13px] font-bold leading-snug">Вышла новая версия админки</div>
          <Button
            variant="surface"
            size="sm"
            loading={busy}
            className="h-10 shrink-0"
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
      <div className="accent-fill grid h-10 w-10 shrink-0 place-items-center rounded-[var(--r-md)] !shadow-none">
        {ios ? <SquarePlus className="h-5 w-5" /> : <Download className="h-5 w-5" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-black uppercase tracking-wide text-[var(--text)]">Админка как приложение</div>
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
