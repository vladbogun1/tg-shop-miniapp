package com.maxsolch.shop.web.dto;

/**
 * A new TOTP secret to add to the authenticator app: base32 for manual entry, the otpauth:// URI
 * for the QR code (and to open the app on the same phone).
 */
public record TwoFactorSetupResponse(String secret, String otpauthUri, String account, String issuer) {
}
