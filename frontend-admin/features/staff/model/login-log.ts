export type LoginResultTone = "ok" | "danger" | "warn" | "neutral";

export const LOGIN_RESULT: Record<string, { label: string; tone: LoginResultTone }> = {
  OK: { label: "Вход", tone: "ok" },
  BAD_PASSWORD: { label: "Неверный пароль", tone: "danger" },
  UNKNOWN_LOGIN: { label: "Неизвестный логин", tone: "danger" },
  BAD_CODE: { label: "Неверный код", tone: "danger" },
  LOCKED: { label: "Блокировка", tone: "warn" },
  NOT_ADMIN: { label: "Не админ", tone: "danger" },
  BAD_TELEGRAM: { label: "Ошибка Telegram", tone: "danger" },
};

export const SECOND_FACTOR: Record<string, string> = {
  TOTP: "код",
  TRUSTED_DEVICE: "доверенное устройство",
  SETUP: "настройка 2FA",
};

export function loginResult(code: string): { label: string; tone: LoginResultTone } {
  return LOGIN_RESULT[code] ?? { label: code, tone: "neutral" };
}

export function loginMethodLabel(method: string): string {
  return method === "TELEGRAM" ? "Telegram" : method === "INVITE" ? "приглашение" : "пароль";
}
