/**
 * `test` of the money suite: the admin API and the fake bank are fixtures, and `buyOnline` makes what a
 * real purchase makes — a buyer, an order paid online, the payment page (an invoice at the fake bank).
 * Products: the seeded scarf (499 ₴), socks (99 ₴) and cap (349 ₴); each spec buys its own units.
 */
import crypto from "node:crypto";
import { CustomerApi } from "../lib/api.js";
import { createUser, newBuyerId } from "../lib/customer.js";
import { FakeMono } from "../lib/mono.js";
import { test as base, expect } from "../lib/test.js";

export { expect };

export interface Purchase {
  orderId: string;
  buyerName: string;
  buyer: CustomerApi;
  invoiceId: string;
  amountMinor: number;
}

export interface Money {
  mono: FakeMono;
  /** A buyer places an order for `items` and opens the payment page — nothing is paid yet. */
  buyOnline(items: { productId: string; quantity: number }[]): Promise<Purchase>;
}

function publicIp(): string {
  const part = () => 1 + Math.floor(Math.random() * 250);
  return `203.${part()}.${part()}.${part()}`;
}

export const test = base.extend<{ money: Money }>({
  money: async ({}, use) => {
    const mono = await FakeMono.create();
    await mono.reset();
    const buyers: CustomerApi[] = [];
    await use({
      mono,
      async buyOnline(items) {
        const id = newBuyerId();
        await createUser(id);
        const buyer = await CustomerApi.create(id, publicIp());
        buyers.push(buyer);
        // Unique, so the board search finds exactly one card.
        const buyerName = `Платник ${crypto.randomBytes(3).toString("hex")}`;
        const { orderId } = await buyer.placeOrder(buyerName, items);
        const page = await buyer.startPayment(orderId);
        return { orderId, buyerName, buyer, invoiceId: page.invoiceId, amountMinor: page.amountMinor };
      },
    });
    await Promise.all(buyers.map((b) => b.dispose()));
    await mono.dispose();
  },
});

export { containerOf, dialog, openOrderFromBoard, toast } from "../lib/test.js";
