package com.maxsolch.shop.ai.domain;

import java.util.List;

/**
 * Objects whose AI results are decided on their own screen, not in «ИИ-задачи → Проверить»: a supply draft (its
 * reading, matching and cards are accepted or thrown away with the draft) and the invoice of the manual supply way
 * (the supply created from it is the decision). Their tasks are only in «История» and their outcome comes from that
 * screen. A new feature of the same kind adds its subject type here.
 */
public final class OwnScreen {

    public static final List<String> SUBJECTS = List.of("SUPPLY_DRAFT", "SUPPLY_FILES");

    private OwnScreen() {
    }
}
