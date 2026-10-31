/** English UI strings. Translated from ru.ts — keep the keys and their order in sync. */
import { sharedEn } from "@shop/customer/i18n/shared-en";
import type { RuDictionary } from "./ru";

export const en: RuDictionary = {
  ...sharedEn,
  // ── common ────────────────────────────────────────────────────────────────
  "common.next": "Next",
  "common.sessionExpiredApp": "Your session ended — reopen the shop",
  "common.currencyPerItem": "each",

  // ── time ──────────────────────────────────────────────────────────────────

  // ── order statuses ────────────────────────────────────────────────────────

  // ── bottom tabs ───────────────────────────────────────────────────────────
  "tabs.shop": "Shop",
  "tabs.cart": "Cart",
  "tabs.account": "Account",

  // ── small bits ────────────────────────────────────────────────────────────
  "lang.title": "Language",
  "lang.switch": "Switch language",

  // ── notifications ─────────────────────────────────────────────────────────
  "notifications.unread": "New messages: {n}",

  // ── chat ──────────────────────────────────────────────────────────────────

  // ── product card ──────────────────────────────────────────────────────────
  "product.outOfStockShort": "Out",
  "product.variantLabel": "Option",
  "addToCart.add": "Add to cart",

  // ── order status timeline ─────────────────────────────────────────────────

  // ── conversation list ─────────────────────────────────────────────────────
  "inbox.title": "Messages",
  "inbox.empty": "No new messages",
  "inbox.youPrefix": "You: ",
  "inbox.orderNumber": "Order {id}",
  "inbox.noPreview": "—",

  // ── add to cart ───────────────────────────────────────────────────────────
  "addToCart.chooseVariant": "Choose an option",
  "addToCart.remove": "Remove from cart",

  // ── gallery ───────────────────────────────────────────────────────────────
  "gallery.photoAlt": "{alt} — photo {n}",
  "gallery.photoLabel": "Photo {n}",

  // ── product card (details) ────────────────────────────────────────────────
  "product.chooseHint": " — choose",
  "product.variantOutSuffix": " (out)",
  "product.stockLeft": "In stock: {n}",

  // ── checkout steps ────────────────────────────────────────────────────────
  "checkout.stepCounter": "Step {current}/{total}",

  // ── promo code ────────────────────────────────────────────────────────────

  // ── catalogue ─────────────────────────────────────────────────────────────
  "catalog.tagline": "Pick it and add to cart",
  "catalog.search": "Search products",
  "catalog.searchClear": "Clear search",
  "catalog.sort.popular": "Most popular first",
  "catalog.sort.priceAsc": "Cheapest first",
  "catalog.sort.priceDesc": "Most expensive first",
  "catalog.allTags": "All",
  "catalog.error.title": "Couldn't load",
  "catalog.error.text": "The server is unavailable. Check your connection and try again.",
  "catalog.empty.titleApp": "Nothing here yet",
  "catalog.empty.textApp": "No products yet. Check back later — new arrivals are on the way.",
  "catalog.noResults.title": "Nothing found",
  "catalog.noResults.text": "Try changing your search, category or filters.",
  "catalog.resetFilters": "Reset filters",
  "catalog.addedToast": "Added to cart",
  // catalog v2: categories, filters, specs
  "catalog.markdown": "Markdown",
  "catalog.cond.markdown": "Markdown",
  "catalog.cond.used": "Used",
  "catalog.filter.show": { one: "Show {n} product", other: "Show {n} products" },
  "catalog.filter.showNone": "No matching products",
  "catalog.filter.reset": "Reset",
  "catalog.filter.resetAll": "Reset all",
  "catalog.filter.brand": "Brand",
  "catalog.filter.price": "Price, ₴",
  "catalog.filter.from": "from",
  "catalog.filter.to": "to",
  "catalog.filter.inStock": "In stock only",
  "catalog.filter.condition": "Condition",
  "catalog.filter.specs": "Specifications",
  "catalog.filter.chooseCategory": "Pick a category to filter by specifications",
  "catalog.filter.remove": "Remove filter “{name}”",
  "catalog.filter.rangeFrom": "from {n}",
  "catalog.filter.rangeTo": "up to {n}",
  "product.allProducts": "All products",
  "product.specs.title": "Specifications",
  "product.specs.all": "All specifications",
  "product.specs.collapse": "Collapse",

  // ── cart ──────────────────────────────────────────────────────────────────
  "cart.itemCount": { one: "{n} item", other: "{n} items" },
  "cart.rowItems": "Items",
  "cart.rowDiscount": "Discount",
  "cart.rowDiscountWithCode": "Discount · {code}",

  // ── account ───────────────────────────────────────────────────────────────
  "account.titleApp": "Account",
  "account.subtitle": "Profile and order history",
  "account.guest": "Guest",
  "account.ordersBadge": { one: "{n} order", other: "{n} orders" },
  "account.myOrders": "My orders",
  "account.error.title": "Couldn't load",
  "account.error.text": "Sign in via Telegram or check your connection.",
  "account.empty.title": "No orders yet",
  "account.empty.text": "Place your first order — it will show up here.",
  "account.itemsCount": { one: "{n} item", other: "{n} items" },

  // ── payment ───────────────────────────────────────────────────────────────

  // ── order chat ────────────────────────────────────────────────────────────
  "chat.replyTo": "Reply · {name}",
  "chat.cancelReply": "Cancel reply",
  "chat.placeholderApp": "Message…",

  // ── support (questions not about an order) ───────────────────────────────
  "support.entry": "Support",
  "support.entryHint": "Questions about products, delivery and payment",
  "support.subtitle": "Your questions to the shop",
  "support.error": "Couldn't load your requests.",
  "support.status.OPEN": "Open",
  "support.status.CLOSED": "Closed",
  "support.newTitle": "New question",
  "support.newHint": "Write your question — the shop will answer here and the bot will notify you.",
  "support.aboutProduct": "Question about a product",
  "support.closed": "This request is closed. Write again and it reopens.",
  "support.waiting": "Waiting for the shop's answer",
  "support.chars": "{n} / {max}",

  // ── order ─────────────────────────────────────────────────────────────────
  "order.recipient": "Recipient",
  "order.openChat": "Open chat",
  "order.copy": "Copy: {label}",

  // ── order cancellation ────────────────────────────────────────────────────
  "order.npDelivery": "Nova Poshta · {city}",

  // ── online payment (monobank) on the order page ──────────────────────────
  "pay.title": "Payment",
  "pay.hint": "Payment opens in your browser: Google Pay, Apple Pay, card or monobank. You’ll come back here afterwards.",
  "pay.prepayment": "Prepayment online, the remaining {amount} on delivery.",
  "pay.hm": "{h} h {m} min",
  "pay.m": "{m} min",
  "pay.timeUp": "The time to pay is over",
  "pay.failedGeneric": "The payment failed. Try again or use another card.",
  "pay.retry": "Try again · {amount}",
  "pay.method.cardLast4": "Card •• {last4}",
  "pay.method.apple": "Apple Pay",
  "pay.method.google": "Google Pay",
  "pay.method.monobank": "monobank",
  "pay.willConfirm": "We will check availability and confirm the order.",
  "pay.openFallback": "Payment didn’t open? Open it in Telegram",

  // ── Nova Poshta branch map ────────────────────────────────────────────────
  "np.confirm": "Choose this branch",

  // ── checkout ──────────────────────────────────────────────────────────────
  "checkout.step.contacts": "Contacts",
  "checkout.step.delivery": "Delivery",
  "checkout.step.payment": "Payment",
  "checkout.step.done": "Done",
  "checkout.redirecting": "Opening the payment…",

  "checkout.contacts.intro": "Where and to whom we deliver — let's start with your contacts.",
  "checkout.contacts.name": "First and last name",
  "checkout.contacts.nameError": "Enter your name",
  "checkout.contacts.phone": "Phone",
  "checkout.contacts.phoneError": "Enter a number: +38 (0XX) XXX-XX-XX",

  "checkout.delivery.np": "Nova Poshta",
  "checkout.delivery.npSubtitle": "Branch / parcel locker",
  "checkout.delivery.pickup": "Pickup",
  "checkout.delivery.pickupSubtitle": "From the shop's point",
  "checkout.delivery.mapHint": "Find a branch on the map and tap “Choose”.",
  "checkout.delivery.required": "Pick a branch — from the list or on the map.",
  "checkout.delivery.pickupText": "Collect your order from the shop's point — we will contact you about the address and time.",
  "checkout.delivery.mapLoading": "Loading the map…",
  "checkout.delivery.comment": "Comment on the order (optional)",
  "checkout.np.modeText": "Type it in",
  "checkout.np.modeMap": "Pick on the map",
  "checkout.np.city": "City",
  "checkout.np.cityPlaceholder": "Start typing the name",
  "checkout.np.cityNone": "City not found",
  "checkout.np.warehouse": "Branch / parcel locker",
  "checkout.np.warehousePlaceholder": "Number or address",
  "checkout.np.warehouseNone": "No such branch in this city",
  "checkout.np.lastWarehouse": "Same as your previous order",
  "checkout.np.changeLast": "Choose another",

  "checkout.payment.error": "Couldn't load the payment options.",
  "checkout.payment.none": "No payment options are set up.",
  "checkout.payment.full": "The full amount online: card, Apple Pay or Google Pay",
  "checkout.payment.prepayOnline": "{amount} online now, the rest in cash on delivery",
  "checkout.payment.trust": "Paid via monobank — the shop never sees your card details",
  "checkout.payment.deadline": "Pay within 24 hours, otherwise the order is cancelled automatically.",

  "checkout.confirm.items": "Items",
  "checkout.confirm.sum": "Subtotal",
  "checkout.confirm.discount": "Discount",
  "checkout.confirm.discountWithCode": "Discount · {code}",
  "checkout.confirm.total": "Total",
  "checkout.confirm.dueNow": "Due now",
  "checkout.confirm.rest": "The remaining {amount} on delivery.",
  "checkout.confirm.promoProblem": "Promo code “{code}”: {message}",
  "checkout.confirm.promoChecking": "checking…",

  // ── reviews and review bonus (Phase C) ───────────────────────────────────
  "reviews.starsAria": "Rated {value} out of 5",
  "reviews.ratingAria": { one: "Rated {value} out of 5, {n} review", other: "Rated {value} out of 5, {n} reviews" },
  "reviews.distAria": "{star}★: {n}",
  "reviews.loadError": "Could not load reviews.",
  "reviews.showMore": "Show more",
  "reviews.anonymous": "Customer",
  "reviews.variant": "Variant: {name}",
  "reviews.form.ratingLabel": "Rating",
  "reviews.form.starN": "{n} out of 5",
  "reviews.form.textLabel": "Review text",
  "reviews.form.pickStars": "Pick a rating",
  "reviews.deliveredAt": "delivered {date}",
  "reviews.thanks": "Thanks for your review!",
  "reviews.thanksModeration": "It will appear after a moderator checks it.",
  "reviews.thanksPublished": "Your review is published.",
  "reviews.bonus.copy": "Copy code {code}",
  "reviews.bonus.copied": "Copied",
  "reviews.bonus.howTo": "In the cart, an Apply button will appear above the promo code field. The code is single-use and works only for you.",
  "reviews.order.title": "Leave a review — get a discount on your next order",
  "reviews.order.text": "Your first published review on an order earns a personal promo code for the next purchase.",
  "reviews.account.title": "Reviews",
  "reviews.account.subtitle": "Your reviews and bonuses",
  "reviews.account.waiting": { one: "{n} item is waiting for a review", other: "{n} items are waiting for a review" },
  "reviews.account.error": "Could not load reviews.",
  "reviews.account.empty.title": "Nothing here yet",
  "reviews.account.empty.text": "Once an order is delivered, you can review it here and get a bonus.",
  "reviews.account.toOrders": "To my orders",
  "reviews.account.pending": "Waiting for a review",
  "reviews.account.mine": "My reviews",
  "reviews.account.bonuses": "My bonuses",

  // ── payment return page (opened in a browser, outside Telegram) ──────────
  "payReturn.title": "Thank you! Your payment is being processed",
  "payReturn.text": "Taking you back to the shop in Telegram — the payment status updates by itself, and the bot will send you a message.",
  "payReturn.order": "Order {id}",
  "payReturn.back": "Back to the shop",
  "payReturn.closeHint": "Didn’t switch? Tap “Back to the shop” or just close the browser.",
  "payReturn.embedded": "Your payment is being processed…",
  "payReturn.embeddedText": "Taking you back to the order",
  // ---- comparison ----
  "compare.tab": "Compare",
  // ---- gift for the order sum / gift case (docs/GIFT-CASE.md) ----
  "case.giftLeft": "{amount} more for a free gift",
  "case.giftReached": "Gift: {title} — we'll add it to your order for free",
  "case.giftLine": "🎁 Gift for your order total",
  // ---- preorders ----
  "preorder.badge.held": "Reserved",
  "preorder.eta.ordered": "ordered",
  "preorder.eta.transit": "on the way",
  "preorder.eta.card": "{stage} · {d}",
  "preorder.eta.weeks": "~{n} wk",
  "preorder.eta.soon": "soon",
  "preorder.card.queued": "In queue",
  "preorder.variant.coming": " · coming",
  "preorder.variant.held": " · reserved",
  "preorder.block.title": "On its way",
  "preorder.block.titleOut": "Out of stock",
  "preorder.expect": "Expected: {d}",
  "preorder.outHint": "We will message you on Telegram as soon as it is back.",
  "preorder.cta.notify": "Notify me when it arrives",
  "preorder.cta.notifyOut": "Notify me when it is back",
  "preorder.cta.queued": "You are in the queue",
  "preorder.queued.line": "In queue · #{pos} · {n} pcs",
  "preorder.queued.lineNoPos": "In queue · {n} pcs",
  "preorder.queued.change": "Change",
  "preorder.leave": "Leave the queue",
  "preorder.sheet.botText": "We will message you in the Telegram bot when it arrives and hold it for {h} h.",
  "preorder.sheet.botOut": "We will message you in the Telegram bot when it is back in stock.",
  "preorder.sheet.join": "Join the queue",
  "preorder.sheet.save": "Save",
  "preorder.sheet.max": "Up to {n} pcs",
  "preorder.toast.joined": "You are in the queue",
  "preorder.toast.left": "You left the queue",
  "preorder.err.inStock": "This item is already in stock — you can buy it.",
  "preorder.err.generic": "Could not join the queue. Please try again.",
  "preorder.held.title": "Reserved for you until {t}",
  "preorder.held.left": "You can buy: {n} pcs",
  "preorder.ribbon.title": "Coming soon",
  "preorder.ribbon.all": "All",
  "preorder.account.subtitle": "Queues and reservations",
  "preorder.account.heldCount": { one: "{n} reservation is waiting for you", other: "{n} reservations are waiting for you" },
  "preorder.status.waiting": "Waiting",
  "preorder.status.waitingPos": "Waiting · #{pos}",
  "preorder.status.held": "Reserved until {t}",
  "preorder.status.bought": "Bought",
  "preorder.status.expired": "Reservation expired — join again",
  "preorder.status.cancelled": "Left",
  "preorder.row.buy": "Buy",
  "preorder.row.again": "Join again",
  "preorder.row.qty": "{n} pcs",
  "preorder.filter": "Pre-order",
};
