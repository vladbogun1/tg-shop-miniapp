import type { Metadata } from "next";

// The token is in the path: never send it anywhere as a Referer, never index the page.
export const metadata: Metadata = {
  title: "Приглашение — ChiSetup Admin",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

export default function InviteLayout({ children }: { children: React.ReactNode }) {
  return children;
}
