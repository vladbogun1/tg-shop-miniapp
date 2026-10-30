/**
 * `test` of the customer suite: every test gets its own client address.
 *
 * The backend limits by IP and the limits cannot be raised for a test run (RateLimitFilter: 10 sign-ins per
 * 5 min through /api/auth/*, 60 Mini App sign-ins per 5 min, 10 orders per 10 min) — a whole suite from one
 * address would trip them. The backend takes the first non-private address of X-Forwarded-For as the client
 * (ClientIp, Tomcat RemoteIpValve), so the requests to /api carry a made-up public one, different per test.
 * The header is added on the network level (route.continue), where CORS does not look at it.
 */
import { test as base } from "@playwright/test";
import { API_URL, SITE_URL } from "../env.js";

export { expect } from "@playwright/test";

export function randomPublicIp(): string {
  const part = (max: number) => 1 + Math.floor(Math.random() * max);
  return `203.${part(250)}.${part(250)}.${part(250)}`;
}

export const test = base.extend<{ clientIp: string }>({
  clientIp: [
    async ({ context }, use) => {
      const ip = randomPublicIp();
      await context.route(
        (url) => url.href.startsWith(`${API_URL}/api/`) || url.href.startsWith(`${SITE_URL}/api/`),
        (route) => route.continue({ headers: { ...route.request().headers(), "x-forwarded-for": ip } }),
      );
      await use(ip);
    },
    { auto: true },
  ],
});
