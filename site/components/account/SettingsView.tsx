"use client";

/**
 * Profile & settings: site language and the list of web sessions (GET /api/me/sessions)
 * with "end this one" / "sign out everywhere", plus sign out.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LogOut, Monitor, Smartphone } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { WebSession } from "@shop/shared";
import { LangSwitch } from "@/components/layout/LangSwitch";
import { Button } from "@/components/ui/Button";
import { useI18n } from "@/i18n/context";
import { api } from "@/lib/api";
import { rememberUser, SESSION_KEY, useLogout } from "@/lib/session";
import { useFmt } from "@/lib/use-fmt";

/**
 * The backend already humanizes the agent ("Chrome, Windows"); only the icon is derived here.
 * A raw User-Agent (older sessions) is still shown as-is.
 */
function describeAgent(ua: string | null | undefined): { label: string; mobile: boolean } | null {
  if (!ua) return null;
  return { label: ua, mobile: /android|ios|iphone|ipad|mobile/i.test(ua) };
}

export function SettingsView() {
  const { t, href } = useI18n();
  const router = useRouter();
  const logout = useLogout();

  return (
    <div className="flex flex-col gap-5">
      <section className="nb p-5">
        <h2 className="font-display text-[16px] font-bold uppercase tracking-[.06em] text-[var(--ink)]">{t("settings.language")}</h2>
        <div className="mt-3">
          <LangSwitch />
        </div>
      </section>

      <Sessions />

      <div>
        <Button
          variant="surface"
          icon={<LogOut className="h-4 w-4" strokeWidth={2.25} />}
          onClick={async () => {
            await logout();
            router.replace(href("/"));
          }}
        >
          {t("settings.logout")}
        </Button>
      </div>
    </div>
  );
}

function Sessions() {
  const { t, href } = useI18n();
  const fmt = useFmt();
  const qc = useQueryClient();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["me", "sessions"],
    queryFn: () => api.sessions(),
  });
  const sessions = (data ?? []).slice().sort((a, b) => Number(b.current) - Number(a.current));

  async function revoke(s: WebSession) {
    setBusy(s.id);
    try {
      await api.revokeSession(s.id);
      if (s.current) {
        rememberUser(null);
        qc.setQueryData(SESSION_KEY, { authed: false, unread: 0 });
        router.replace(href("/"));
        return;
      }
      await qc.invalidateQueries({ queryKey: ["me", "sessions"] });
    } finally {
      setBusy(null);
    }
  }

  async function revokeAll() {
    setBusy("all");
    try {
      await api.revokeAllSessions();
    } finally {
      rememberUser(null);
      qc.removeQueries({ queryKey: ["me"] });
      qc.setQueryData(SESSION_KEY, { authed: false, unread: 0 });
      router.replace(href("/"));
    }
  }

  return (
    <section id="sessions" className="nb p-5">
      <h2 className="font-display text-[16px] font-bold uppercase tracking-[.06em] text-[var(--ink)]">{t("settings.sessions")}</h2>
      <p className="mt-1 text-[13px] font-medium text-[var(--muted)]">{t("settings.sessions.lead")}</p>
      {isLoading && <div className="shimmer mt-4 h-20" />}
      {isError && <p className="mt-4 text-[14px] font-semibold text-[var(--danger)]">{t("settings.sessions.error")}</p>}
      {data && sessions.length === 0 && <p className="mt-4 text-[14px] font-medium text-[var(--muted)]">{t("settings.sessions.empty")}</p>}
      <ul className="mt-4 flex flex-col gap-2">
        {sessions.map((s) => {
          const agent = describeAgent(s.userAgent);
          const Icon = agent?.mobile ? Smartphone : Monitor;
          return (
            <li
              key={s.id}
              className={`flex flex-wrap items-center gap-3 rounded-[var(--r)] border border-[var(--line)] p-3 ${
                s.current ? "bg-[var(--surface-2)]" : "bg-[var(--surface)]"
              }`}
            >
              <Icon className="h-5 w-5 shrink-0 text-[var(--accent)]" strokeWidth={2.5} />
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-semibold text-[var(--ink)]">
                  {agent?.label ?? t("settings.sessions.unknown")}
                  {s.current && (
                    <span className="ml-2 inline-block rounded-full bg-[color-mix(in_srgb,var(--ok)_16%,transparent)] px-2 py-0.5 align-middle font-display text-[10px] font-bold uppercase tracking-wider text-[var(--ok)]">
                      {t("settings.sessions.current")}
                    </span>
                  )}
                </p>
                <p className="text-[12px] font-semibold text-[var(--muted)]">
                  {s.ip ? `${s.ip} · ` : ""}
                  {t("settings.sessions.created", { when: fmt.dateTime(s.createdAt) })}
                  {s.lastUsedAt ? ` · ${t("settings.sessions.lastUsed", { when: fmt.dateTime(s.lastUsedAt) })}` : ""}
                </p>
              </div>
              <Button size="sm" variant="surface" loading={busy === s.id} onClick={() => void revoke(s)}>
                {t("settings.sessions.revoke")}
              </Button>
            </li>
          );
        })}
      </ul>
      {sessions.length > 0 && (
        <Button className="mt-4" size="sm" variant="ink" loading={busy === "all"} onClick={() => void revokeAll()}>
          {t("settings.sessions.revokeAll")}
        </Button>
      )}
    </section>
  );
}
