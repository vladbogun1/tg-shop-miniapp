package com.maxsolch.shop.web.dto;

/** An admin the UI can offer as a quick "send test to" target. */
public record AdminTargetDto(long telegramUserId, String name, String username) {
}
