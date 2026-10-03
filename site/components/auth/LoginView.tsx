"use client";

/**
 * Sign-in through the shop's Telegram bot (SITE-SPEC "Вход на сайт через бота").
 *
 *  1. POST /api/auth/web/start → loginId, deepLink, matchCode (+ HttpOnly `login_bind` cookie).
 *  2. The customer opens the bot (button, or QR on desktop) and taps the SAME two-digit number
 *     the site shows — that is what ties the Telegram account to THIS browser.
 *  3. The page polls /status every 2 s; on CONFIRMED it calls /complete, which sets the session
 *     cookies, and goes to `next`.
 *  REJECTED / EXPIRED / USED → explain and offer a restart.
 *
 * In development a "Dev login" form signs in as any Telegram user id (POST /api/auth/web/dev-login,
 * which only exists in the backend's dev profile). The block is compiled out of production builds.
 */
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2, RotateCcw, Send, Smartphone, XCircle } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { WebLoginStart, WebLoginStatus } from "@shop/shared";
import { Button } from "@/components/ui/Button";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { useI18n } from "@/i18n/context";
import { api, ApiError } from "@/lib/api";
import { rememberUser, SESSION_KEY, useSession } from "@/lib/session";

type Phase =
  | { kind: "starting" }
  | { kind: "pending"; start: WebLoginStart }
  | { kind: "ended"; reason: "REJECTED" | "EXPIRED" | "USED" | "FAILED" | "COMPLETE_FAILED"; message?: string };

const POLL_MS = 2000;

/** Only same-site relative paths are allowed as a redirect target (no open redirect). */
function safeNext(raw: string | null, fallback: string): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return fallback;
  return raw;
}

export function LoginView() {
  const { t, href } = useI18n();
  const router = useRouter();
  const qc = useQueryClient();
  const session = useSession();
  const [phase, setPhase] = useState<Phase>({ kind: "starting" });
  const [confirming, setConfirming] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const nextRef = useRef<string>(href("/account"));
  const startedRef = useRef(false);

  useEffect(() => {
    nextRef.current = safeNext(new URLSearchParams(window.location.search).get("next"), href("/account"));
  }, [href]);

  const finish = useCallback(
    (user: Parameters<typeof rememberUser>[0]) => {
      rememberUser(user);
      qc.setQueryData(SESSION_KEY, { authed: true, unread: 0 });
      void qc.invalidateQueries({ queryKey: SESSION_KEY });
      router.replace(nextRef.current);
    },
    [qc, router]
  );

  const start = useCallback(async () => {
    setConfirming(false);
    setPhase({ kind: "starting" });
    try {
      const s = await api.loginStart();
      setPhase({ kind: "pending", start: s });
    } catch (e) {
      setPhase({
        kind: "ended",
        reason: "FAILED",
        message: e instanceof ApiError && e.status === 429 ? e.message : undefined,
      });
    }
  }, []);

  // Start once — but not for someone who is already signed in.
  useEffect(() => {
    if (session.status !== "guest" || startedRef.current) return;
    startedRef.current = true;
    void start();
  }, [session.status, start]);

  // Poll the status while pending; stop on any terminal state or when the code expires.
  const pendingId = phase.kind === "pending" ? phase.start.loginId : null;
  const pendingExpiry = phase.kind === "pending" ? phase.start.expiresAt : null;
  useEffect(() => {
    if (!pendingId) return;
    const loginId = pendingId;
    let cancelled = false;
    const deadline = new Date(pendingExpiry ?? "").getTime();

    const tick = async () => {
      if (cancelled) return;
      if (Number.isFinite(deadline) && Date.now() > deadline + 1500) {
        setPhase({ kind: "ended", reason: "EXPIRED" });
        return;
      }
      let status: WebLoginStatus | null = null;
      try {
        status = (await api.loginStatus(loginId)).status;
      } catch {
        /* transient — try again on the next tick */
      }
      if (cancelled) return;
      if (status === "CONFIRMED") {
        // Not tied to `cancelled`: the exchange must finish even if this effect re-runs.
        setConfirming(true);
        try {
          const res = await api.loginComplete(loginId);
          if (mounted.current) finish(res?.user ?? null);
        } catch {
          if (mounted.current) setPhase({ kind: "ended", reason: "COMPLETE_FAILED" });
        }
        return;
      }
      if (status === "REJECTED" || status === "EXPIRED" || status === "USED") {
        setPhase({ kind: "ended", reason: status });
        return;
      }
      timer = setTimeout(tick, POLL_MS);
    };
    let timer = setTimeout(tick, POLL_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [pendingId, pendingExpiry, finish]);

  return (
    <div className="container-site max-w-4xl pt-8 md:pt-12">
      <h1 className="text-[30px] font-black uppercase tracking-tight text-[var(--ink)] sm:text-[40px]">{t("login.title")}</h1>
      <p className="mt-2 max-w-2xl text-[15px] font-semibold text-[var(--muted)]">{t("login.lead")}</p>

      {session.status === "authed" ? (
        <div className="nb mt-8 flex flex-col items-start gap-4 p-6">
          <p className="flex items-center gap-2 text-[16px] font-extrabold text-[var(--ink)]">
            <CheckCircle2 className="h-5 w-5 text-[var(--ok)]" strokeWidth={2.75} /> {t("login.already")}
          </p>
          <ButtonLink href={href("/account")} variant="accent">
            {t("login.toAccount")}
          </ButtonLink>
        </div>
      ) : (
        <div className="nb-lg mt-8 grid gap-8 p-5 sm:p-8 md:grid-cols-[1fr_auto]">
          <div className="min-w-0">
            <ol className="flex flex-col gap-3">
              {(["login.step1", "login.step2", "login.step3"] as const).map((k, i) => (
                <li key={k} className="flex items-center gap-3 text-[15px] font-bold text-[var(--ink)]">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[var(--r)] border-[2.5px] border-[var(--line)] bg-[var(--c3)] text-[14px] font-black text-[var(--accent-ink)]">
                    {i + 1}
                  </span>
                  {t(k)}
                </li>
              ))}
            </ol>

            <div className="mt-7" aria-live="polite">
              {phase.kind === "starting" && (
                <p className="flex items-center gap-2 text-[15px] font-bold text-[var(--muted)]">
                  <Loader2 className="h-5 w-5 animate-spin" /> {t("common.loading")}
                </p>
              )}

              {phase.kind === "pending" && (
                <div className="flex flex-col gap-5">
                  <div className="flex flex-wrap items-center gap-5">
                    <div
                      className="grid h-[120px] w-[150px] place-items-center rounded-[var(--r)] border-[4px] border-[var(--line)] bg-[var(--accent)] text-[72px] font-black leading-none tracking-tight text-[var(--accent-ink)] shadow-[7px_7px_0_var(--shadow)]"
                      aria-label={`${t("login.code")}: ${phase.start.matchCode}`}
                    >
                      {phase.start.matchCode}
                    </div>
                    <p className="max-w-[220px] text-[18px] font-black uppercase leading-tight text-[var(--ink)]">
                      {t("login.code")}
                    </p>
                  </div>
                  <a
                    href={phase.start.deepLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-[60px] w-full items-center justify-center gap-3 rounded-[var(--r)] border-[3px] border-[var(--line)] bg-[var(--c2)] px-6 text-[18px] font-black uppercase tracking-wide text-white shadow-[5px_5px_0_var(--shadow)] transition-transform hover:-translate-x-[1px] hover:-translate-y-[1px] active:translate-x-[5px] active:translate-y-[5px] active:shadow-none sm:w-auto"
                  >
                    <Send className="h-6 w-6" strokeWidth={2.5} /> {t("login.open")}
                  </a>
                  <p className="flex items-center gap-2 text-[14px] font-bold text-[var(--muted)]">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {confirming ? t("login.confirmed") : t("login.waiting")}
                  </p>
                </div>
              )}

              {phase.kind === "ended" && (
                <div className="flex flex-col items-start gap-4">
                  <p className="flex items-start gap-2 text-[15px] font-extrabold text-[var(--danger)]">
                    <XCircle className="mt-0.5 h-5 w-5 shrink-0" strokeWidth={2.75} />
                    {phase.message ??
                      t(
                        phase.reason === "REJECTED"
                          ? "login.rejected"
                          : phase.reason === "EXPIRED"
                            ? "login.expired"
                            : phase.reason === "USED"
                              ? "login.used"
                              : phase.reason === "COMPLETE_FAILED"
                                ? "login.completeFailed"
                                : "login.failed"
                      )}
                  </p>
                  <Button variant="accent" icon={<RotateCcw className="h-4 w-4" strokeWidth={2.75} />} onClick={() => void start()}>
                    {t("login.restart")}
                  </Button>
                </div>
              )}
            </div>
          </div>

          {phase.kind === "pending" && (
            <div className="hidden flex-col items-center gap-3 md:flex">
              <div className="rounded-[var(--r)] border-[3px] border-[var(--line)] bg-white p-3 shadow-[5px_5px_0_var(--shadow)]">
                <QRCodeSVG value={phase.start.deepLink} size={196} level="M" marginSize={0} />
              </div>
              <p className="flex max-w-[220px] items-center gap-1.5 text-center text-[12px] font-bold text-[var(--muted)]">
                <Smartphone className="h-4 w-4 shrink-0" /> {t("login.qr")}
              </p>
            </div>
          )}
        </div>
      )}

      <p className="mt-6 max-w-2xl text-[13px] font-medium text-[var(--muted)]">{t("login.why")}</p>

      {process.env.NODE_ENV === "development" && session.status !== "authed" && <DevLogin onDone={finish} />}
    </div>
  );
}

function DevLogin({ onDone }: { onDone: (user: Parameters<typeof rememberUser>[0]) => void }) {
  const { t } = useI18n();
  const [id, setId] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <form
      className="mt-10 max-w-md rounded-[var(--r)] border-[3px] border-dashed border-[var(--warn)] bg-[var(--surface)] p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const n = Number(id);
        if (!Number.isFinite(n) || n <= 0) return;
        setBusy(true);
        setErr(null);
        try {
          const res = await api.devLogin(n);
          onDone(res?.user ?? null);
        } catch (e2) {
          setErr(e2 instanceof ApiError ? `${e2.status}: ${e2.message}` : String(e2));
          setBusy(false);
        }
      }}
    >
      <p className="nb-up text-[12px] font-black text-[var(--warn)]">{t("login.dev.title")}</p>
      <label className="mt-3 block text-[13px] font-bold text-[var(--ink)]">
        {t("login.dev.userId")}
        <input
          value={id}
          onChange={(e) => setId(e.target.value.replace(/\D/g, ""))}
          inputMode="numeric"
          name="telegramUserId"
          className="mt-1 h-11 w-full rounded-[var(--r)] border-[2.5px] border-[var(--line)] bg-[var(--surface)] px-3 text-[15px] font-bold text-[var(--ink)] outline-none focus:border-[var(--accent)]"
        />
      </label>
      {err && <p className="mt-2 text-[12px] font-bold text-[var(--danger)]">{err}</p>}
      <Button type="submit" variant="surface" size="sm" loading={busy} className="mt-3">
        {t("login.dev.submit")}
      </Button>
    </form>
  );
}
