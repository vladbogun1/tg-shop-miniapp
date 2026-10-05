import { redirect } from "next/navigation";
import { localePath } from "@/i18n";
import { localeOf } from "@/lib/route";

/**
 * The old "order placed" screen (requisites + transfer screenshot) is gone: payment is online now,
 * and the order page shows everything about it. Kept as a redirect for links already sent out.
 */
type Params = Promise<{ locale: string; id: string }>;

export default async function SuccessRedirect({ params }: { params: Params }) {
  const locale = await localeOf(params);
  const { id } = await params;
  redirect(localePath(locale, `/account/orders/${encodeURIComponent(id)}`));
}
