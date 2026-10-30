import type { Team, TeamAdmin, TeamInvite } from "../api";

export type TeamRow = { type: "admin"; admin: TeamAdmin } | { type: "invite"; invite: TeamInvite };

/** Порядок таблицы: активные админы, открытые приглашения, потом заблокированные. */
export function teamRows(team: Team | undefined): TeamRow[] {
  if (!team) return [];
  return [
    ...team.admins.filter((a) => a.active).map((a) => ({ type: "admin" as const, admin: a })),
    ...team.invites.map((i) => ({ type: "invite" as const, invite: i })),
    ...team.admins.filter((a) => !a.active).map((a) => ({ type: "admin" as const, admin: a })),
  ];
}
