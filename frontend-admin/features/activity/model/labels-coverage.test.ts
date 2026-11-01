/** Сторож: каждый тип сообщения бота из Java имеет подпись в журнале «Бот и сайт» (иначе владелец видит сырой код). */
import { expect, it } from "vitest";
import { BOT_TYPE_PATTERNS, backendCodes } from "@/lib/backend-codes";
import { TYPE_LABEL } from "./labels";

it("каждый тип сообщения бота имеет подпись", () => {
  const types = backendCodes(BOT_TYPE_PATTERNS);
  expect(types.length).toBeGreaterThan(15); // регулярка не должна молча перестать находить типы
  expect(types.filter((t) => !(t in TYPE_LABEL))).toEqual([]);
});
