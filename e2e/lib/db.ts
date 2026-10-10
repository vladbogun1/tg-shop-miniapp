/**
 * Direct SQL for the few things no admin endpoint can set up (an extra admin for «Выйти везде»,
 * reading a row the UI does not show). Same database the global setup seeds.
 */
import mysql from "mysql2/promise";
import { DB } from "../env.js";

export async function withDb<T>(fn: (conn: mysql.Connection) => Promise<T>): Promise<T> {
  const conn = await mysql.createConnection({ ...DB, charset: "utf8mb4", timezone: "Z" });
  try {
    return await fn(conn);
  } finally {
    await conn.end();
  }
}

export async function query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  return withDb(async (conn) => {
    const [rows] = await conn.query(sql, params);
    return rows as T[];
  });
}
