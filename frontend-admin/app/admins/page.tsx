import { redirect } from "next/navigation";
import { withQuery, type PageSearchParams } from "@/lib/with-query";

/** «Админы» переехали в «Настройки → Админы»; старые ссылки и закладки ведут туда же (с теми же параметрами). */
export default async function AdminsPage({ searchParams }: { searchParams: Promise<PageSearchParams> }) {
  redirect(withQuery("/settings/admins", await searchParams));
}
