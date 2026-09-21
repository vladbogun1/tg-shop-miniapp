/** English UI strings. Translated from ru.ts — keep the keys and their order in sync. */
import type { RuDictionary } from "./ru";

export const en: RuDictionary = {
  // ── common ────────────────────────────────────────────────────────────────
  "common.back": "Back",
  "common.next": "Next",
  "common.cancel": "Cancel",
  "common.close": "Close",
  "common.retry": "Retry",
  "common.loading": "Loading…",
  "common.toCatalog": "Browse shop",
  "common.currencyPerItem": "each",

  // ── time ──────────────────────────────────────────────────────────────────
  "time.today": "Today",
  "time.yesterday": "Yesterday",
  "time.justNow": "just now",
  "time.minutes": "{n} min",
  "time.hours": "{n} h",

  // ── order statuses ────────────────────────────────────────────────────────
  "status.NEW": "New",
  "status.APPROVED": "Approved",
  "status.SHIPPED": "Shipped",
  "status.DELIVERED": "Delivered",
  "status.REJECTED": "Rejected",

  // ── bottom tabs ───────────────────────────────────────────────────────────
  "tabs.shop": "Shop",
  "tabs.cart": "Cart",
  "tabs.account": "Account",

  // ── small bits ────────────────────────────────────────────────────────────
  "theme.toggle": "Switch theme",
  "lang.title": "Language",
  "lang.switch": "Switch language",
  "soon.badge": "Soon",
  "qty.decrease": "Decrease",
  "qty.increase": "Increase",

  // ── notifications ─────────────────────────────────────────────────────────
  "notifications.unread": "New messages: {n}",

  // ── chat ──────────────────────────────────────────────────────────────────
  "chat.reply.fallbackSender": "Message",
  "chat.attachment.photo": "Photo",
  "chat.attachment.file": "File",

  // ── product card ──────────────────────────────────────────────────────────
  "product.inStock": "In stock",
  "product.outOfStockShort": "Out",
  "product.outOfStock": "Out of stock",
  "product.choose": "Choose",

  // ── order status timeline ─────────────────────────────────────────────────
  "timeline.rejected.title": "Order rejected",
  "timeline.rejected.text": "The order was not accepted for processing",
  "timeline.current": "Current status",

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
  "gallery.prev": "Previous photo",
  "gallery.next": "Next photo",

  // ── product card (details) ────────────────────────────────────────────────
  "product.chooseHint": " — choose",
  "product.variantOut": " (out)",
  "product.stockLeft": "In stock: {n}",

  // ── checkout steps ────────────────────────────────────────────────────────
  "checkout.stepCounter": "Step {current}/{total}",

  // ── promo code ────────────────────────────────────────────────────────────
  "promo.placeholder": "Promo code",
  "promo.clear": "Remove promo code",
  "promo.hint": "Got a promo code? Enter it — the discount applies straight away.",
  "promo.checking": "Checking…",
  "promo.notFound": "Promo code not found",
  "promo.discount": "{discount} off {subtotal}",
  "promo.heldUntil": " · reserved for you until {time}",

  // ── catalogue ─────────────────────────────────────────────────────────────
  "catalog.tagline": "Pick it and add to cart",
  "catalog.search": "Search products",
  "catalog.searchClear": "Clear search",
  "catalog.sort": "Sorting",
  "catalog.sort.popular": "Most popular first",
  "catalog.sort.priceAsc": "Cheapest first",
  "catalog.sort.priceDesc": "Most expensive first",
  "catalog.sort.name": "By name (A–Z)",
  "catalog.allTags": "All",
  "catalog.error.title": "Couldn't load",
  "catalog.error.text": "The server is unavailable. Check your connection and try again.",
  "catalog.empty.title": "Nothing here yet",
  "catalog.empty.text": "No products yet. Look in later — new arrivals are on the way.",
  "catalog.noResults.title": "Nothing found",
  "catalog.noResults.text": "Try changing your search or picking another tag.",
  "catalog.resetFilters": "Reset filters",
  "catalog.addedToast": "Added to cart",

  // ── cart ──────────────────────────────────────────────────────────────────
  "cart.title": "Cart",
  "cart.itemCount": { one: "{n} item", other: "{n} items" },
  "cart.empty.title": "Your cart is empty",
  "cart.empty.text": "Add products from the catalogue — they will show up here.",
  "cart.remove": "Remove",
  "cart.rowItems": "Items",
  "cart.rowDiscount": "Discount",
  "cart.rowDiscountWithCode": "Discount · {code}",
  "cart.total": "Total",
  "cart.checkout": "Checkout",

  // ── account ───────────────────────────────────────────────────────────────
  "account.title": "Account",
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
  "payment.paid": "Paid",
  "payment.claimed": "Being checked",
  "payment.unpaid": "Unpaid",

  // ── order chat ────────────────────────────────────────────────────────────
  "chat.online": "Online",
  "chat.connecting": "Connecting…",
  "chat.loadEarlier": "Show earlier",
  "chat.error": "Couldn't load the conversation.",
  "chat.empty": "No messages yet. Write to the shop about this order.",
  "chat.attachmentAlt": "Attachment",
  "chat.replyTo": "Reply · {name}",
  "chat.cancelReply": "Cancel reply",
  "chat.attach": "Attach an image",
  "chat.placeholder": "Message…",
  "chat.send": "Send",
  "chat.sendFailed": "Couldn't send",
  "chat.imagesOnly": "You can only send images",
  "chat.uploadFailed": "Couldn't upload the attachment",

  // ── order ─────────────────────────────────────────────────────────────────
  "order.error": "Couldn't load the order.",
  "order.status": "Status",
  "order.rejectReason": "Reason for rejection",
  "order.tracking": "Tracking number",
  "order.createdAt": "Created {when}",
  "order.items": "Items",
  "order.gift": "Gift · free",
  "order.giftMany": "Gift × {n} · free",
  "order.sum": "Subtotal",
  "order.discount": "Discount",
  "order.discountWithCode": "Discount ({code})",
  "order.total": "Total",
  "order.recipient": "Recipient",
  "order.delivery": "Delivery",
  "order.pickup": "Pickup",
  "order.payment": "Payment",
  "order.comment": "Comment",
  "order.requisites.card": "Card",
  "order.requisites.edrpou": "Tax ID (RNOKPP)",
  "order.requisites.purpose": "Payment reference",
  "order.requisites.note": "Note",
  "order.paymentConfirmed": "Payment confirmed",
  "order.paymentClaimed": "Payment being checked",
  "order.paymentClaimedText": "Screenshot received. A manager will check the transfer and confirm the payment — the status will update here.",
  "order.openChat": "Open chat",
  "order.copy": "Copy: {label}",
  "order.proof.title": "Transfer confirmation",
  "order.proof.text": "Paid already? Upload a screenshot of the transfer — it goes into the order chat, a manager will check it and confirm the payment.",
  "order.proof.upload": "Upload transfer screenshot",
  "order.proof.failed": "Couldn't send the screenshot",

  // ── order cancellation ────────────────────────────────────────────────────
  "cancel.button": "Cancel order",
  "cancel.title": "Reason for cancelling",
  "cancel.reason.payment": "Problem with payment / card",
  "cancel.reason.changedMind": "Changed my mind",
  "cancel.reason.mistake": "Ordered by mistake",
  "cancel.reason.cheaper": "Found it cheaper",
  "cancel.reason.other": "Other",
  "cancel.otherPlaceholder": "Describe the reason",
  "cancel.failed": "Couldn't cancel the order",
  "order.giftBadge": "🎁 Gift",
  "order.npDelivery": "Nova Poshta · {city}",
  "order.requisitesTitle": "Payment details",

  // ── Nova Poshta branch map ────────────────────────────────────────────────
  "np.cat.all": "All",
  "np.cat.branch": "Branches",
  "np.cat.postomat": "Parcel lockers",
  "np.cat.point": "Pickup points",
  "np.type.branch": "Branch",
  "np.type.postomat": "Parcel locker",
  "np.type.point": "Pickup point",
  "np.hint": "Tap a branch on the map",
  "np.confirm": "Choose this branch",
  "np.number": "No. {n}",

  // ── checkout ──────────────────────────────────────────────────────────────
  "checkout.title": "Checkout",
  "checkout.step.contacts": "Contacts",
  "checkout.step.delivery": "Delivery",
  "checkout.step.payment": "Payment",
  "checkout.step.done": "Done",
  "checkout.emptyCart": "Your cart is empty.",
  "checkout.submit": "Place order · {total}",
  "checkout.failed": "Couldn't place the order",
  "checkout.promoDropped": "{message}. The promo code was removed — please place the order again.",

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
  "checkout.delivery.change": "Change branch",
  "checkout.delivery.required": "Choose a branch on the map.",
  "checkout.delivery.pickupText": "Collect your order from the shop's point — we will contact you about the address and time.",
  "checkout.delivery.mapLoading": "Loading the map…",
  "checkout.delivery.comment": "Comment on the order (optional)",

  "checkout.payment.error": "Couldn't load the payment options.",
  "checkout.payment.none": "No payment options are set up.",
  "checkout.payment.prepay": "Prepayment {amount}",

  "checkout.confirm.items": "Items",
  "checkout.confirm.sum": "Subtotal",
  "checkout.confirm.discount": "Discount",
  "checkout.confirm.discountWithCode": "Discount · {code}",
  "checkout.confirm.total": "Total",
  "checkout.confirm.dueNow": "Due now",
  "checkout.confirm.rest": "The remaining {amount} on delivery.",
  "checkout.confirm.promoProblem": "Promo code “{code}”: {message}",
  "checkout.confirm.promoChecking": "checking…",

  "checkout.success.title": "Order placed!",
  "checkout.success.orderNumber": "Order number",
  "checkout.success.requisites": "Payment details · {payment}",
  "checkout.success.payByRequisites": "Pay using the details below. Confirmation goes to the order chat.",
  "checkout.success.claimed": "The transfer screenshot was sent to the order chat. A manager will check it and confirm the payment.",
  "checkout.success.payLater": "You can pay later — from the order page",
  "checkout.success.openOrder": "Go to the order",
};
