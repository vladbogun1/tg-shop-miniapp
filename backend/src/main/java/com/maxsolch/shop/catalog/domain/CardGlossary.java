package com.maxsolch.shop.catalog.domain;

/**
 * Глоссарий ru → uk → en для переводов в промпте. Тот же текст, что {@code GLOSSARY} в
 * frontend-admin/features/translation/model/prompt.ts (проверяет CardPromptInSyncTest).
 */
public final class CardGlossary {

    private CardGlossary() {
    }

    public static final String TEXT = """
Глайды, скейтсы → uk: Глайди → en: mouse skates (glides); категория — «Mouse Skates»
Дуйки (аккумуляторная воздуходувка) → uk: Дуйки (повітродувки); категория — «Дуйки» → en: air blowers; категория — «Air Blowers»
Кабеля / кабель → uk: Кабелі / кабель → en: Cables / cable
Кейкапы, кепки (на клаву) → uk: Кейкапи → en: Keycaps
клава → uk: клавіатура → en: keyboard
КЛВ Магнитные → uk: Магнітні клавіатури → en: Magnetic Keyboards
КЛВ Механические → uk: Механічні клавіатури → en: Mechanical Keyboards
Коврики, ковер, ковёр → uk: Килимки, килимок → en: Mouse pads, mouse pad
Кресла → uk: Крісла → en: Chairs
Мышки, мышь → uk: Мишки, мишка/миша → en: Mice, mouse
Наушники → uk: Навушники → en: Headphones
Рукава, рукав → uk: Рукави, рукав → en: Gaming sleeves, gaming sleeve
Стеклянный пад, стеклопад → uk: Скляні пади, склопад → en: Glass mouse pads, glass pad
Столы → uk: Столи → en: Desks
Уценка → uk: Уцінка → en: Discounted (open box); категория — «Discounted»
на весь стол → uk: на весь стіл → en: desk-size
переключатели / свитчи → uk: перемикачі / світчі → en: switches
частота опроса → uk: частота опитування → en: polling rate
подсветка → uk: підсвітка → en: backlight / RGB lighting
беспроводная / проводная → uk: бездротова / дротова → en: wireless / wired
скольжение → uk: ковзання → en: glide
новые (вариант) → uk: нові → en: New
открытая пачка (вариант) → uk: відкрита пачка → en: Opened pack
Передоплата 100 грн → uk: Передоплата 100 грн → en: 100 UAH prepayment
Полная оплата на счет ФОП → uk: Повна оплата на рахунок ФОП → en: Full payment to the store's account (FOP)
ФОП → uk: ФОП → en: FOP (sole proprietor) в длинном тексте; в коротком — «store account»
наложенный платёж → uk: накладений платіж → en: cash on delivery
Новая Почта → uk: Нова Пошта → en: Nova Poshta
""".strip();
}
