import { redirect } from "next/navigation";
import { withQuery, type PageSearchParams } from "@/lib/with-query";

/** «Оплата» переехала в «Настройки → Оплата»; старые ссылки и закладки ведут туда же (с теми же параметрами). */
export default async function PaymentPage({ searchParams }: { searchParams: Promise<PageSearchParams> }) {
  redirect(withQuery("/settings/payment", await searchParams));
}
