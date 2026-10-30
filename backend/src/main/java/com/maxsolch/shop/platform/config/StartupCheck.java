package com.maxsolch.shop.platform.config;

import java.util.List;

/**
 * A module's part of the startup configuration check: it reads its own settings, logs a warning, or adds a line to
 * {@code fatal} (which stops the start outside the dev profile). {@link StartupSecurityCheck} runs all of them after
 * the checks that belong to the platform itself, so the platform never has to know a module's settings.
 */
public interface StartupCheck {

    void check(boolean dev, List<String> fatal);
}
