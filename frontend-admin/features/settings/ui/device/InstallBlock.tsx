"use client";

import { Button } from "@shop/ui/admin-button";
import { CheckCircle2, Download, RefreshCw, Share, SquarePlus } from "lucide-react";
import { applyUpdate, isIos, isIosSafari, promptInstall, usePwa } from "@/lib/pwa";
import { Note } from "./parts";

/** Как установить админку приложением: подсказка по платформе + «Обновить приложение». */
function InstallHint() {
  const pwa = usePwa();
  if (pwa.standalone) {
    return (
      <Note icon={<CheckCircle2 className="h-4 w-4 text-[var(--ok)]" />}>
        Админка открыта как <b className="text-[var(--text)]">приложение</b>.
      </Note>
    );
  }
  if (pwa.canInstall) {
    return (
      <Button variant="surface" icon={<Download className="h-4 w-4" />} onClick={() => void promptInstall()} className="w-full sm:w-auto sm:self-start">
        Установить приложение
      </Button>
    );
  }
  if (isIosSafari()) {
    return (
      <Note icon={<SquarePlus className="h-4 w-4" />}>
        <b className="text-[var(--text)]">Установить на iPhone:</b> нажмите{" "}
        <span className="inline-flex translate-y-[2px] items-center gap-1 font-semibold text-[var(--text)]">
          <Share className="h-4 w-4" aria-hidden />
          «Поделиться»
        </span>{" "}
        внизу Safari → <b className="text-[var(--text)]">«На экран Домой»</b> → «Добавить». Потом откройте админку с иконки и
        войдите заново (у приложения свой вход).
      </Note>
    );
  }
  if (isIos()) {
    return (
      <Note icon={<SquarePlus className="h-4 w-4" />}>
        На iPhone установить админку можно из <b className="text-[var(--text)]">Safari</b>: откройте этот адрес в Safari →
        «Поделиться» → «На экран Домой».
      </Note>
    );
  }
  return (
    <Note icon={<Download className="h-4 w-4" />}>
      Установить можно из Chrome или Edge: меню браузера → «Установить приложение» / «Добавить на главный экран».
    </Note>
  );
}

export function InstallBlock() {
  const pwa = usePwa();
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <InstallHint />
      {pwa.updateReady && (
        <Button variant="surface" icon={<RefreshCw className="h-4 w-4" />} onClick={applyUpdate} className="w-full sm:w-auto sm:self-start">
          Обновить приложение
        </Button>
      )}
    </div>
  );
}
