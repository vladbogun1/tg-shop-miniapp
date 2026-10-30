package com.maxsolch.shop.staff.api;

import com.maxsolch.shop.staff.app.AdminInviteService;
import com.maxsolch.shop.staff.app.AdminTeamService;
import com.maxsolch.shop.staff.app.ClientInfo;
import com.maxsolch.shop.platform.security.RequiredSuperAdmin;
import com.maxsolch.shop.platform.web.CurrentActor;
import com.maxsolch.shop.staff.api.AdminTeamDtos.CodeRequest;
import com.maxsolch.shop.staff.api.AdminTeamDtos.FinanceRequest;
import com.maxsolch.shop.staff.api.AdminTeamDtos.InviteCreated;
import com.maxsolch.shop.staff.api.AdminTeamDtos.InviteRequest;
import com.maxsolch.shop.staff.api.AdminTeamDtos.UpdateRequest;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * «Админы» — SUPER_ADMIN only ({@link RequiredSuperAdmin}: the role is read from the database on
 * every request; an ordinary admin gets 403). Rules: {@link AdminTeamService}.
 */
@RestController
@RequestMapping("/api/admin/admins")
@RequiredSuperAdmin
@Tag(name = "Admin Team", description = "Super admin: invite, edit, reset, block and delete admins")
@SecurityRequirement(name = "bearer-jwt")
public class AdminTeamController {

    private final AdminTeamService team;
    private final CurrentActor actor;

    public AdminTeamController(AdminTeamService team, CurrentActor actor) {
        this.actor = actor;
        this.team = team;
    }

    @GetMapping
    @Operation(summary = "Admins (role, 2FA, last sign-in, devices) and open invites of new admins")
    public AdminTeamService.Team list() {
        return team.team(actor.userId());
    }

    @PostMapping("/invites")
    @Operation(summary = "Invite a new admin / give an existing admin a login (bot sends the link)")
    public InviteCreated invite(@Valid @RequestBody InviteRequest r, HttpServletRequest http) {
        return dto(team.invite(actor.userId(), r.telegramUserId(), r.name(), r.role(), r.code(),
                RequestClient.of(http)));
    }

    @PostMapping("/invites/{id}/resend")
    @Operation(summary = "New link for an invite (the old one stops working)")
    public InviteCreated resend(@PathVariable long id) {
        return dto(team.resendInvite(actor.userId(), id));
    }

    @DeleteMapping("/invites/{id}")
    @Operation(summary = "Revoke an invite")
    public ResponseEntity<Void> revoke(@PathVariable long id) {
        team.revokeInvite(actor.userId(), id);
        return ResponseEntity.noContent().build();
    }

    @PatchMapping("/{id}")
    @Operation(summary = "Change name / role (role change needs the caller's code)")
    public ResponseEntity<Void> update(@PathVariable long id, @Valid @RequestBody UpdateRequest r,
                                       HttpServletRequest http) {
        team.update(actor.userId(), id, r.name(), r.role(), r.code(), RequestClient.of(http));
        return ResponseEntity.noContent().build();
    }

    @PutMapping("/{id}/finance")
    @Operation(summary = "«Финансы» on / off: purchase prices, expenses and margin (needs the caller's code)")
    public ResponseEntity<Void> finance(@PathVariable long id, @Valid @RequestBody FinanceRequest r,
                                        HttpServletRequest http) {
        team.setFinance(actor.userId(), id, r.finance(), r.code(), RequestClient.of(http));
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{id}/reset-2fa")
    @Operation(summary = "Reset the admin's 2FA (set up again at next sign-in); ends their sessions")
    public ResponseEntity<Void> resetTwoFactor(@PathVariable long id, @Valid @RequestBody CodeRequest r,
                                               HttpServletRequest http) {
        team.resetTwoFactor(actor.userId(), id, r.code(), RequestClient.of(http));
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{id}/reset-password")
    @Operation(summary = "Reset the password: old one dies now, a link to set a new one is sent")
    public InviteCreated resetPassword(@PathVariable long id, @Valid @RequestBody CodeRequest r,
                                       HttpServletRequest http) {
        return dto(team.resetPassword(actor.userId(), id, r.code(), RequestClient.of(http)));
    }

    @PostMapping("/{id}/forget-devices")
    @Operation(summary = "Forget the admin's trusted devices")
    public Map<String, Integer> forgetDevices(@PathVariable long id) {
        return Map.of("forgotten", team.forgetDevices(actor.userId(), id));
    }

    @PostMapping("/{id}/block")
    @Operation(summary = "Block: active=false, every session ends, no sign-in at all")
    public ResponseEntity<Void> block(@PathVariable long id, @Valid @RequestBody CodeRequest r, HttpServletRequest http) {
        team.block(actor.userId(), id, r.code(), RequestClient.of(http));
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{id}/unblock")
    @Operation(summary = "Unblock")
    public ResponseEntity<Void> unblock(@PathVariable long id, @Valid @RequestBody CodeRequest r,
                                        HttpServletRequest http) {
        team.unblock(actor.userId(), id, r.code(), RequestClient.of(http));
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{id}/delete")
    @Operation(summary = "Delete an admin without history (otherwise 409 HAS_HISTORY — block instead)")
    public ResponseEntity<Void> delete(@PathVariable long id, @Valid @RequestBody CodeRequest r,
                                       HttpServletRequest http) {
        team.delete(actor.userId(), id, r.code(), RequestClient.of(http));
        return ResponseEntity.noContent().build();
    }

    private static InviteCreated dto(AdminInviteService.Created c) {
        return new InviteCreated(c.inviteId(), c.kind().name(), c.delivered(), c.link(), c.path(), c.expiresAt());
    }
}
