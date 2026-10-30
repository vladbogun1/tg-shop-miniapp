/**
 * The Mini App's way in without Telegram. frontend/app/layout.tsx has a DEV-only `?tgstub=<id>`
 * script that installs a fake window.Telegram.WebApp; a production build (the one e2e runs, like
 * the CI frontends job builds) drops it. This is the same stub (same user shape, same unsigned
 * initData the e2e backend accepts with ALLOW_UNSIGNED_INIT_DATA), installed by Playwright before
 * any page script runs. Keep it in step with DEV_TELEGRAM_STUB in layout.tsx.
 */
import type { BrowserContext } from "@playwright/test";
import { telegramStubScript } from "./tg-stub-script.js";

/** Signs the browser context in to the Mini App as this Telegram user (no real telegram.org script is loaded). */
export async function installTelegramStub(context: BrowserContext, telegramUserId: number, languageCode = "uk"): Promise<void> {
  await context.route("https://telegram.org/**", (r) => r.abort());
  await context.addInitScript(telegramStubScript(telegramUserId, languageCode));
}
