import { redirect } from "next/navigation";

/** «Теги» became «Категории» (catalog v2) — old bookmarks land on the new screen. */
export default function TagsRedirect() {
  redirect("/categories");
}
