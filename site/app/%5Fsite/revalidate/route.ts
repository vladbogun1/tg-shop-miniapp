/**
 * POST /_site/revalidate — on-demand ISR, called by the backend after a product/tag is saved.
 *
 *   header  x-revalidate-secret: ${SITE_REVALIDATE_SECRET}
 *   body    { "paths": ["/product/<slug>", "/ru/catalog", ...] }
 *
 * Lives under /_site (folder "%5Fsite", because a leading underscore marks a private folder in
 * the App Router) and NOT under /api: in production the gateway sends all of /api to the backend.
 * Paths arrive as the visitor sees them; Ukrainian ones have no prefix but live under /uk inside the
 * app (see middleware.ts), so they are mapped before revalidating. The data cache tags "catalog" and
 * "payment-options" are dropped as well, so lists, category counts and the checkout's payment
 * methods refresh too. `{ "all": true }` (the admin's «Обновить сайт») rebuilds every page.
 */
import { revalidatePath, revalidateTag } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

function internalPath(p: string): string | null {
  if (typeof p !== "string" || !p.startsWith("/") || p.length > 300) return null;
  const clean = p.split("?")[0];
  if (/^\/(ru|en|uk)(\/|$)/.test(clean)) return clean;
  return clean === "/" ? "/uk" : `/uk${clean}`;
}

export async function POST(req: NextRequest) {
  const secret = process.env.SITE_REVALIDATE_SECRET;
  if (!secret || req.headers.get("x-revalidate-secret") !== secret) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  let paths: unknown = [];
  let all = false;
  try {
    const body = (await req.json()) as { paths?: unknown; all?: unknown };
    paths = body.paths ?? [];
    all = body.all === true;
  } catch {
    return NextResponse.json({ ok: false, error: "bad json" }, { status: 400 });
  }
  if (!Array.isArray(paths)) return NextResponse.json({ ok: false, error: "paths must be an array" }, { status: 400 });

  revalidateTag("catalog");
  revalidateTag("payment-options");
  if (all) {
    // Every page under the root layout, in every locale.
    revalidatePath("/", "layout");
    return NextResponse.json({ ok: true, revalidated: ["*"] });
  }
  const done: string[] = [];
  for (const p of paths.slice(0, 200)) {
    const internal = internalPath(p as string);
    if (!internal) continue;
    revalidatePath(internal);
    done.push(internal);
  }
  return NextResponse.json({ ok: true, revalidated: done });
}
