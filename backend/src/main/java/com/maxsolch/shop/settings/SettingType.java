package com.maxsolch.shop.settings;

/**
 * Value type of a setting. Values are stored as text: INT as a decimal integer, BOOL as
 * {@code true}/{@code false}, STRING/TEXT verbatim (STRING is one line, TEXT may span lines).
 */
public enum SettingType {
    INT,
    BOOL,
    STRING,
    TEXT
}
