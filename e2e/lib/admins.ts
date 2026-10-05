/**
 * The e2e admins' sign-in state, reset before every run (after fixtures/seed.sql):
 *  - the bootstrap admin (id 1, created by the backend from ADMIN_LOGIN / ADMIN_PASSWORD) gets a
 *    KNOWN TOTP secret, so the specs can compute its codes;
 *  - «e2e-second» (id 2): password + known secret — trusted device and password change;
 *  - «e2e-fresh» (id 3): password, no 2FA — the first-sign-in setup;
 *  - «e2e-team» (id 4): ordinary admin with 2FA — the «Админы» specs (no access, 2FA reset, block).
 * Lock counters, last used steps, trusted devices and sign-in history start clean; invites and the
 * admins created through them (tg ids from INVITED_TG_BASE) are removed.
 */
import type { Connection } from "mysql2/promise";
import { ADMIN, ADMIN_2FA_KEY, FRESH_ADMIN, INVITED_TG_BASE, SECOND_ADMIN, TEAM_ADMIN } from "../env.js";
import { encryptSecret, resetUsedSteps } from "./totp";

export async function resetAdmins(conn: Connection): Promise<void> {
  const ids = [ADMIN.id, SECOND_ADMIN.id, FRESH_ADMIN.id, TEAM_ADMIN.id];
  await conn.query("DELETE FROM admin_invites");
  await conn.query("DELETE FROM admin_users WHERE telegram_user_id >= ?", [INVITED_TG_BASE]);
  await conn.query("DELETE FROM admin_login_log WHERE admin_id >= ?", [INVITED_TG_BASE]);
  await conn.query("UPDATE admin_users SET role = 'SUPER_ADMIN', active = TRUE WHERE telegram_user_id = ?", [ADMIN.id]);
  await conn.query(
    `INSERT INTO admin_users (telegram_user_id, username, password_hash, name, role, active, token_version)
     VALUES (?, ?, ?, 'E2E Второй', 'ADMIN', TRUE, 0), (?, ?, ?, 'E2E Новый', 'ADMIN', TRUE, 0),
            (?, ?, ?, 'E2E Команда', 'ADMIN', TRUE, 0)
     ON DUPLICATE KEY UPDATE username = VALUES(username), password_hash = VALUES(password_hash),
       name = VALUES(name), role = VALUES(role), active = TRUE`,
    [
      SECOND_ADMIN.id, SECOND_ADMIN.login, SECOND_ADMIN.passwordHash,
      FRESH_ADMIN.id, FRESH_ADMIN.login, FRESH_ADMIN.passwordHash,
      TEAM_ADMIN.id, TEAM_ADMIN.login, TEAM_ADMIN.passwordHash,
    ]
  );
  await conn.query(
    `UPDATE admin_users SET failed_attempts = 0, locked_until = NULL, totp_last_step = NULL,
       totp_pending_enc = NULL, totp_pending_at = NULL WHERE telegram_user_id IN (?)`,
    [ids]
  );
  for (const [id, secret] of [
    [ADMIN.id, ADMIN.totpSecret],
    [SECOND_ADMIN.id, SECOND_ADMIN.totpSecret],
    [TEAM_ADMIN.id, TEAM_ADMIN.totpSecret],
  ] as const) {
    await conn.query(
      "UPDATE admin_users SET totp_secret_enc = ?, totp_enabled_at = NOW() WHERE telegram_user_id = ?",
      [encryptSecret(secret, id, ADMIN_2FA_KEY), id]
    );
  }
  await conn.query("UPDATE admin_users SET totp_secret_enc = NULL, totp_enabled_at = NULL WHERE telegram_user_id = ?", [
    FRESH_ADMIN.id,
  ]);
  await conn.query("DELETE FROM admin_trusted_devices WHERE admin_id IN (?)", [ids]);
  await conn.query("DELETE FROM admin_login_log WHERE admin_id IN (?) OR admin_id IS NULL", [ids]);
  resetUsedSteps();
}
