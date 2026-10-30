package com.maxsolch.shop.journal.domain;

/** Why a bot call failed: a stable code for filters + a readable, sanitised text. */
public record BotFailure(String code, String message) {
}
