interface TgUserLike {
  firstName?: string;
  lastName?: string;
  username?: string;
}

/** First letters of name (or username) for the avatar tile; falls back to "?". */
export function deriveInitials(firstName?: string, lastName?: string, username?: string): string {
  const a = firstName?.trim()?.[0];
  const b = lastName?.trim()?.[0];
  if (a && b) return (a + b).toUpperCase();
  if (a) return a.toUpperCase();
  const u = username?.trim()?.[0];
  if (u) return u.toUpperCase();
  return "?";
}

/** "First Last", else the username, else the guest label. */
export function displayNameOf(user: TgUserLike | null | undefined, guest: string): string {
  return [user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.username || guest;
}
