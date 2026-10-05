package com.maxsolch.shop.web.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.time.Instant;

/** Requests / answers of the «Админы» section and of the public /invite page (stage 2). */
public final class AdminTeamDtos {

    private AdminTeamDtos() {
    }

    /** «Пригласить админа»: Telegram id (picked from the shop's users or typed), name, role, own code. */
    public record InviteRequest(Long telegramUserId, @Size(max = 255) String name, @Size(max = 16) String role,
                                @Size(max = 16) String code) {
    }

    /** Name and / or role; {@code code} is required when the role changes. */
    public record UpdateRequest(@Size(max = 255) String name, @Size(max = 16) String role,
                                @Size(max = 16) String code) {
    }

    /** The super admin's own current code for a dangerous action. */
    public record CodeRequest(@Size(max = 16) String code) {
    }

    /** A new invite link: {@code link}/{@code path} only when the bot could NOT deliver it. */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record InviteCreated(long inviteId, String kind, boolean delivered, String link, String path,
                                Instant expiresAt) {
    }

    // ---- public /invite

    public record InviteTokenRequest(@NotBlank @Size(max = 128) String token) {
    }

    public record InviteAcceptRequest(@NotBlank @Size(max = 128) String token, @Size(max = 64) String username,
                                      @Size(max = 256) String password) {
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record InviteAcceptResponse(String next, TwoFactorSetupResponse setup) {
    }

    public record InviteCompleteRequest(@NotBlank @Size(max = 128) String token, @Size(max = 16) String code,
                                        boolean trustDevice) {
    }
}
