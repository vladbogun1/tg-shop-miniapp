// Texts of the 30.10 broadcast (Telegram HTML, a caption is at most 1024 characters).
// Two messages each: the purchase draw (old customers: «Участвовать»; everyone else: «В магазин»),
// then the pumpkin hunt. Pictures: <mediaDir>/<lang>/orders.* and pumpkins.*.
import { config } from "./config.js";

const RULES = { uk: "/halloween-rules", ru: "/ru/halloween-rules", en: "/en/halloween-rules" };
const rules = (l) => `${config.siteUrl}${RULES[l]}`;
const streams = () => config.streams.map((s) => `<a href="${s.url}">${s.name}</a>`).join(" і ");
const streamsRu = () => config.streams.map((s) => `<a href="${s.url}">${s.name}</a>`).join(" и ");
const streamsEn = () => config.streams.map((s) => `<a href="${s.url}">${s.name}</a>`).join(" and ");

export const TEXTS = {
  oldOrders: {
    uk: () => `🎃 <b>Хеллоуїн у ChiSetup</b>

Ти вже не раз купував у нас, дякуємо! Тому ти вже в розіграші за покупки. Лишилось підтвердити: натисни «Беру участь» під цим повідомленням.

Кожне нове замовлення від 500 ₴ до 1 листопада 20:00 додає ще квиток, до 5 квитків.

Суперприз: сетап Proove (клавіатура Slicker Pro, навушники Bliss, килимок Radiance XL і витий кабель). Усього 10 призів.

📺 Розігруємо 1 листопада о 21:00 наживо на ${streams()}.
❗ Будь на стрімі: якщо виграєш, відгукнись протягом 2 хвилин у чаті стріму або відповіддю боту. Інакше приз розіграємо заново.
<a href="${rules("uk")}">Правила</a>`,
    ru: () => `🎃 <b>Хэллоуин в ChiSetup</b>

Ты уже не раз покупал у нас, спасибо! Поэтому ты уже в розыгрыше за покупки. Осталось подтвердить: нажми «Участвовать» под этим сообщением.

Каждый новый заказ от 500 ₴ до 1 ноября 20:00 добавляет ещё билет, до 5 билетов.

Суперприз: сетап Proove (клавиатура Slicker Pro, наушники Bliss, коврик Radiance XL и витой кабель). Всего 10 призов.

📺 Разыгрываем 1 ноября в 21:00 вживую на ${streamsRu()}.
❗ Будь на стриме: если выиграешь, отзовись в течение 2 минут в чате стрима или ответом боту. Иначе приз разыграем заново.
<a href="${rules("ru")}">Правила</a>`,
    en: () => `🎃 <b>Halloween at ChiSetup</b>

You've bought from us before, thank you! That puts you in the purchase draw. Just confirm it: tap «Join» below this message.

Every new order from 500 UAH until November 1, 20:00 Kyiv adds another ticket, up to 5.

Grand prize: a Proove setup (Slicker Pro keyboard, Bliss headphones, Radiance XL mat and a coiled cable). 10 prizes in total.

📺 Live draw on November 1 at 21:00 Kyiv on ${streamsEn()}.
❗ Be on the stream: if you win, respond within 2 minutes in the stream chat or by replying to the bot. Otherwise the prize is drawn again.
<a href="${rules("en")}">Rules</a>`,
  },
  restOrders: {
    uk: () => `🎃 <b>Хеллоуїн у ChiSetup: два розіграші</b>

Перший для покупців. Замов від 500 ₴ до 1 листопада 20:00, і ти в розіграші: квиток за кожні 500 ₴, до 5 квитків.

Суперприз: сетап Proove (клавіатура Slicker Pro, навушники Bliss, килимок Radiance XL і витий кабель). Усього 10 призів.

📺 Розігруємо 1 листопада о 21:00 наживо на ${streams()}.
❗ Будь на стрімі: якщо виграєш, відгукнись протягом 2 хвилин у чаті стріму або відповіддю боту. Інакше приз розіграємо заново.
<a href="${rules("uk")}">Правила</a>`,
    ru: () => `🎃 <b>Хэллоуин в ChiSetup: два розыгрыша</b>

Первый для покупателей. Закажи от 500 ₴ до 1 ноября 20:00, и ты в розыгрыше: билет за каждые 500 ₴, до 5 билетов.

Суперприз: сетап Proove (клавиатура Slicker Pro, наушники Bliss, коврик Radiance XL и витой кабель). Всего 10 призов.

📺 Разыгрываем 1 ноября в 21:00 вживую на ${streamsRu()}.
❗ Будь на стриме: если выиграешь, отзовись в течение 2 минут в чате стрима или ответом боту. Иначе приз разыграем заново.
<a href="${rules("ru")}">Правила</a>`,
    en: () => `🎃 <b>Halloween at ChiSetup: two draws</b>

The first one is for buyers. Order from 500 UAH until November 1, 20:00 Kyiv and you're in: one ticket per 500 UAH, up to 5.

Grand prize: a Proove setup (Slicker Pro keyboard, Bliss headphones, Radiance XL mat and a coiled cable). 10 prizes in total.

📺 Live draw on November 1 at 21:00 Kyiv on ${streamsEn()}.
❗ Be on the stream: if you win, respond within 2 minutes in the stream chat or by replying to the bot. Otherwise the prize is drawn again.
<a href="${rules("en")}">Rules</a>`,
  },
  oldPumpkins: {
    uk: () => `🎃 <b>А ще є полювання на гарбузи</b>

На сайті й у Mini App ховаються гарбузи. Це окремий розіграш зі своїми 10 призами, головний: навушники Attack Shark G800 і килимок XL «Орнамент».

Один гарбуз уже дає участь, а з усіма 15 шанс набагато більший. За день можна знайти до 8, збір до 1 листопада 20:00.

❗ Будь на стрімі: якщо виграєш, відгукнись протягом 2 хвилин у чаті стріму або відповіддю боту. Інакше приз розіграємо заново.`,
    ru: () => `🎃 <b>А ещё есть охота на тыквы</b>

На сайте и в Mini App прячутся тыквы. Это отдельный розыгрыш со своими 10 призами, главный: наушники Attack Shark G800 и коврик XL «Орнамент».

Одна тыква уже даёт участие, а со всеми 15 шанс намного больше. За день можно найти до 8, сбор до 1 ноября 20:00.

❗ Будь на стриме: если выиграешь, отзовись в течение 2 минут в чате стрима или ответом боту. Иначе приз разыграем заново.`,
    en: () => `🎃 <b>There's also a pumpkin hunt</b>

Pumpkins are hiding on the site and in the Mini App. It's a separate draw with its own 10 prizes, the top one is Attack Shark G800 headphones with an XL «Ornament» mat.

One pumpkin gets you in, all 15 give a much bigger chance. Up to 8 a day, until November 1, 20:00 Kyiv.

❗ Be on the stream: if you win, respond within 2 minutes in the stream chat or by replying to the bot. Otherwise the prize is drawn again.`,
  },
  restPumpkins: {
    uk: () => `🎃 <b>Другий розіграш: за гарбузи</b>

На сайті й у Mini App ховаються гарбузи. Тут нічого купувати не треба. Свої 10 призів, головний: навушники Attack Shark G800 і килимок XL «Орнамент».

Один гарбуз уже дає участь, а з усіма 15 шанс набагато більший. За день можна знайти до 8, збір до 1 листопада 20:00.

❗ Будь на стрімі: якщо виграєш, відгукнись протягом 2 хвилин у чаті стріму або відповіддю боту. Інакше приз розіграємо заново.`,
    ru: () => `🎃 <b>Второй розыгрыш: за тыквы</b>

На сайте и в Mini App прячутся тыквы. Здесь ничего покупать не нужно. Свои 10 призов, главный: наушники Attack Shark G800 и коврик XL «Орнамент».

Одна тыква уже даёт участие, а со всеми 15 шанс намного больше. За день можно найти до 8, сбор до 1 ноября 20:00.

❗ Будь на стриме: если выиграешь, отзовись в течение 2 минут в чате стрима или ответом боту. Иначе приз разыграем заново.`,
    en: () => `🎃 <b>Second draw: pumpkins</b>

Pumpkins are hiding on the site and in the Mini App. No purchase needed. Its own 10 prizes, the top one is Attack Shark G800 headphones with an XL «Ornament» mat.

One pumpkin gets you in, all 15 give a much bigger chance. Up to 8 a day, until November 1, 20:00 Kyiv.

❗ Be on the stream: if you win, respond within 2 minutes in the stream chat or by replying to the bot. Otherwise the prize is drawn again.`,
  },
};

export const BUTTONS = {
  join: { uk: "✅ Беру участь", ru: "✅ Участвовать", en: "✅ Join" },
  shop: { uk: "🛍 У магазин", ru: "🛍 В магазин", en: "🛍 Shop" },
  hunt: { uk: "🎃 Шукати гарбузи", ru: "🎃 Ловить тыквы", en: "🎃 Hunt pumpkins" },
};
