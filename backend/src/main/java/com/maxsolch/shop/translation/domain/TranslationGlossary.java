package com.maxsolch.shop.translation.domain;

import java.util.List;

/**
 * Глоссарий ru → uk → en: контекст автоперевода (DeepL) и тот же текст, что {@code GLOSSARY} в промпте экрана
 * «Переводы» frontend-admin/features/translation/model/prompt.ts (проверяет CardPromptInSyncTest).
 */
public final class TranslationGlossary {

    private TranslationGlossary() {
    }

    /**
     * A term the machine translator must render one way. {@code uk} is null where the translator's own Ukrainian is
     * better: a forced Ukrainian term comes back wrongly inflected («накладеним платіжем», «килимом»), checked on a
     * sample of the shop's texts on 10.11.2026; only what it got wrong without the glossary is forced.
     */
    public record Term(String ru, String uk, String en) {
    }

    /** Terms for the machine translator (DeepL glossary); the prose {@link #TEXT} goes along as context. */
    public static final List<Term> TERMS = List.of(
            new Term("коврик", null, "mouse pad"),
            new Term("стеклопад", null, "glass pad"),
            new Term("глайды", null, "mouse skates"),
            new Term("кейкапы", null, "keycaps"),
            new Term("рукав", null, "gaming sleeve"),
            new Term("уценка", "уцінка", "open box"),
            new Term("наложенный платёж", null, "cash on delivery"),
            new Term("Новая Почта", null, "Nova Poshta"),
            new Term("ТТН", null, "tracking number"),
            new Term("частота опроса", null, "polling rate"),
            new Term("переключатели", null, "switches"),
            new Term("свитчи", null, "switches"),
            new Term("дуйка", null, "air blower"),
            new Term("на весь стол", null, "desk-size"),
            new Term("IEM-наушники", null, "IEM earphones"),
            new Term("тканевый", null, "cloth"),
            new Term("скольжение", null, "glide"));

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
