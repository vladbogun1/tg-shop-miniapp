/**
 * Customer suite helpers: a fresh buyer per test, and orders that cannot be reached through the UI
 * without a real payment or a courier (a delivered one to review, a paid one with a sealed gift case)
 * written straight into the e2e database. Nothing here touches the schema — plain INSERTs, shaped like
 * the admin seed's rows (fixtures/seed.sql).
 */
import crypto from "node:crypto";
import { query } from "./db.js";
import { PRODUCT } from "./seed.js";

let counter = 0;

/** A Telegram id no other test (or run: seed.sql empties `users`) has used. */
export function newBuyerId(): number {
  counter += 1;
  return 920_000_000 + Math.floor(Math.random() * 7_000_000) * 100 + (counter % 100);
}

export async function createUser(telegramUserId: number, name = "Покупець Смоук"): Promise<void> {
  const [first, last] = name.split(" ");
  await query(
    `INSERT IGNORE INTO users (telegram_user_id, username, first_name, last_name, language_code, locale, created_at)
     VALUES (?, ?, ?, ?, 'uk', 'uk', NOW())`,
    [telegramUserId, `e2e_buyer_${telegramUserId}`, first, last ?? null],
  );
}

export interface SeededOrder {
  id: string;
  shortId: string;
}

interface OrderOptions {
  buyer: number;
  status?: "NEW" | "APPROVED" | "SHIPPED" | "DELIVERED";
  paid?: boolean;
  product?: { id: string; title: string; priceMinor: number };
  /** A sealed gift case with this prize (the order is paid, as a case only exists after payment). */
  sealedCase?: { tier: "BRONZE"; discountPercent: number };
}

const CAP = { id: PRODUCT.cap, title: "E2E Кепка", priceMinor: 34900 };

/** An order of `buyer`, as the Mini App / the site list it under «Мої замовлення». */
export async function insertOrder(o: OrderOptions): Promise<SeededOrder> {
  const id = crypto.randomUUID();
  const product = o.product ?? CAP;
  const status = o.status ?? "NEW";
  const paid = o.paid ?? (status === "DELIVERED" || !!o.sealedCase);
  const delivered = status === "DELIVERED";
  await createUser(o.buyer);
  await query(
    `INSERT INTO orders (id, user_id, subtotal_minor, discount_minor, total_minor, currency, customer_name, phone,
        status, approved_at, shipped_at, delivered_at, delivery_method, np_city_ref, np_city_name, np_warehouse_ref,
        np_warehouse_name, payment_option_id, payment_option_title, paid, paid_at, prepayment_minor, received_minor,
        gift_case_status, gift_tier, tg_user_id, tg_username, source, created_at)
     VALUES (UUID_TO_BIN(?), ?, ?, 0, ?, 'UAH', 'Покупець Смоук', '+380000000099',
        ?, IF(?, NOW() - INTERVAL 4 DAY, NULL), IF(?, NOW() - INTERVAL 3 DAY, NULL), IF(?, NOW() - INTERVAL 1 DAY, NULL),
        'NOVA_POSHTA', 'e2e-city', 'Київ', 'e2e-wh-1', 'Відділення №1 (тест): вул. Вигадана, 1',
        UUID_TO_BIN('e2e0b001-0000-4000-8000-000000000003'), 'Полная оплата онлайн', ?, IF(?, NOW() - INTERVAL 4 DAY, NULL),
        0, ?, ?, ?, ?, ?, 'MINIAPP', NOW() - INTERVAL 5 DAY)`,
    [
      id, o.buyer, product.priceMinor, product.priceMinor, status,
      status !== "NEW", status === "SHIPPED" || delivered, delivered,
      paid, paid, paid ? product.priceMinor : 0,
      o.sealedCase ? "SEALED" : null, o.sealedCase?.tier ?? null, o.buyer, `e2e_buyer_${o.buyer}`,
    ],
  );
  await query(
    `INSERT INTO order_items (order_id, product_id, title_snapshot, price_minor_snapshot, variant_id, variant_name_snapshot,
        quantity, gift, returned_qty, restocked_qty)
     VALUES (UUID_TO_BIN(?), UUID_TO_BIN(?), ?, ?, NULL, NULL, 1, FALSE, 0, 0)`,
    [id, product.id, product.title, product.priceMinor],
  );
  if (o.sealedCase) {
    await query(
      `INSERT INTO order_gift_cases (order_id, tier, case_item_id, kind, rarity, title, discount_percent)
       VALUES (UUID_TO_BIN(?), ?, (SELECT id FROM gift_case_items WHERE kind = 'DISCOUNT' AND tier = ? LIMIT 1),
               'DISCOUNT', 'RARE', ?, ?)`,
      [id, o.sealedCase.tier, o.sealedCase.tier, `−${o.sealedCase.discountPercent} %`, o.sealedCase.discountPercent],
    );
  }
  return { id, shortId: "#" + id.replace(/-/g, "").slice(0, 8) };
}

/** What the shop (an admin) wrote in the order chat — the buyer sees it as the shop's answer. */
export async function adminSays(orderId: string, text: string): Promise<void> {
  await query(
    `INSERT INTO order_messages (order_id, sender_type, sender_id, sender_name, type, text, created_at, delivered_at, read_at)
     VALUES (UUID_TO_BIN(?), 'ADMIN', 1, 'Bootstrap admin', 'TEXT', ?, NOW(), NOW(), NULL)`,
    [orderId, text],
  );
}
