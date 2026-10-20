"use client";

/**
 * TEMPORARY (demo only): which way of opening an external page actually works in this Telegram
 * client. Each button tries one variant; every attempt and every bridge call is written on screen
 * and to client_events (event "pay_debug").
 */
import { useEffect, useState } from "react";
import { track } from "@/lib/analytics";

type Tg = {
  platform?: string;
  version?: string;
  initData?: string;
  isFullscreen?: boolean;
  openLink?: (url: string, o?: Record<string, unknown>) => void;
  openTelegramLink?: (url: string) => void;
};

const MONO = "https://pay.monobank.ua/";
const PLAIN = "https://example.com/";

function tg(): Tg | null {
  return (window as unknown as { Telegram?: { WebApp?: Tg } }).Telegram?.WebApp ?? null;
}

export default function PayDebug() {
  const [log, setLog] = useState<string[]>([]);
  const add = (s: string) => {
    const line = `${new Date().toISOString().slice(11, 19)} ${s}`;
    setLog((l) => [line, ...l].slice(0, 40));
    track("pay_debug", s.slice(0, 250));
  };

  useEffect(() => {
    const w = window as unknown as { TelegramWebviewProxy?: { postEvent: (t: string, d: string) => void } };
    const t = tg();
    add(
      `env pf=${t?.platform} v=${t?.version} fs=${t?.isFullscreen} init=${!!t?.initData} proxy=${!!w.TelegramWebviewProxy} ` +
        `ext=${!!(window.external && "notify" in window.external)} iframe=${window.parent !== window} ua=${navigator.userAgent.slice(0, 90)}`
    );
    const p = w.TelegramWebviewProxy;
    if (p && !(p as { __wrapped?: boolean }).__wrapped) {
      const orig = p.postEvent.bind(p);
      p.postEvent = (type: string, data: string) => {
        if (!type.includes("haptic") && !type.includes("viewport")) add(`bridge ${type} ${data}`);
        return orig(type, data);
      };
      (p as { __wrapped?: boolean }).__wrapped = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function run(name: string, fn: () => void) {
    add(`try ${name}`);
    try {
      fn();
      add(`ok ${name}`);
    } catch (e) {
      add(`THROW ${name}: ${String(e)}`);
    }
  }

  const btns: [string, () => void][] = [
    ["1 openLink example", () => tg()?.openLink?.(PLAIN)],
    ["2 openLink example chrome", () => tg()?.openLink?.(PLAIN, { try_browser: "chrome" })],
    ["3 openLink monobank", () => tg()?.openLink?.(MONO, { try_instant_view: false })],
    ["4 openLink monobank chrome", () => tg()?.openLink?.(MONO, { try_instant_view: false, try_browser: "chrome" })],
    [
      "5 openLink example after 700ms",
      () => {
        window.setTimeout(() => run("5b delayed openLink", () => tg()?.openLink?.(PLAIN)), 700);
      },
    ],
    ["6 window.open example", () => void window.open(PLAIN, "_blank")],
    ["7 openTelegramLink t.me/durov", () => tg()?.openTelegramLink?.("https://t.me/durov")],
    ["8 <a target=_blank>", () => {
      const a = document.createElement("a");
      a.href = PLAIN;
      a.target = "_blank";
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
    }],
  ];

  return (
    <div className="flex flex-col gap-2 p-4 text-[13px]">
      <h1 className="text-[18px] font-bold">pay-debug</h1>
      {btns.map(([name, fn]) => (
        <button
          key={name}
          type="button"
          onClick={() => run(name, fn)}
          className="rounded-[10px] border border-[var(--line-strong)] bg-[var(--surface-2)] px-3 py-3 text-left font-semibold"
        >
          {name}
        </button>
      ))}
      <pre className="mt-3 whitespace-pre-wrap break-all text-[11px] text-[var(--muted)]">{log.join("\n")}</pre>
    </div>
  );
}
