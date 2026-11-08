package com.maxsolch.shop.procurement.app;

import java.util.Map;

/** Why an AI task of a draft did not start or did not finish, in words for the draft's warnings. */
final class SupplyDraftReasons {

    private static final Map<String, String> TEXTS = Map.ofEntries(
            Map.entry("AI_NOT_CONFIGURED", "ИИ не настроен"),
            Map.entry("AI_DISABLED", "ИИ или эта функция выключены в настройках"),
            Map.entry("AI_DAY_LIMIT", "исчерпан дневной лимит ИИ"),
            Map.entry("AI_MONTH_LIMIT", "исчерпан месячный лимит ИИ"),
            Map.entry("AI_FAILED", "модель не ответила"),
            Map.entry("AI_BUSY", "ИИ занят — попробуйте позже"),
            Map.entry("AI_KEY_REJECTED", "провайдер ИИ отклонил ключ"),
            Map.entry("AI_JOB_CEILING", "задача потратила больше своего потолка"),
            Map.entry("AI_DEADLINE", "задача не уложилась во время"),
            Map.entry("AI_RESTARTED", "сервер перезапускался во время задачи"),
            Map.entry("AI_RETRY_LIMIT", "повтор уже был — следующий может запустить владелец"),
            Map.entry("AI_FILES_GONE", "картинки накладной уже удалены (хранятся 7 дней)"),
            Map.entry("AI_FILE_NOT_FOUND", "картинка не найдена или уже использована"),
            Map.entry("AI_FILES_LIMIT", "от 1 до 10 картинок"));

    private SupplyDraftReasons() {
    }

    static String of(String code) {
        if (code == null) {
            return "ИИ не ответил";
        }
        return TEXTS.getOrDefault(code, "ошибка ИИ (" + code + ")");
    }
}
