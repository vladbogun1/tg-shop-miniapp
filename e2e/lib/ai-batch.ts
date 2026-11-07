/**
 * Помощники для спека пакетов ИИ (43): чистка пакетов между сценариями, «поиск был» у задач пакета (fake-ai не
 * умеет искать в интернете, а «Принять безопасное» требует поиск) и пустые описания у товаров, чтобы ИИ было что заполнять.
 */
import { withDb } from "./db";

const IN = (n: number) => Array.from({ length: n }, () => "UUID_TO_BIN(?)").join(", ");

/** Все пакеты и их задачи — прочь: каждый сценарий начинает с пустой полосы. */
export async function clearBatches(): Promise<void> {
  await withDb(async (conn) => {
    await conn.query("DELETE FROM ai_apply_log");
    await conn.query("DELETE FROM ai_job_bodies WHERE job_id IN (SELECT id FROM ai_jobs WHERE batch_id IS NOT NULL)");
    await conn.query("DELETE FROM ai_jobs WHERE batch_id IS NOT NULL");
    await conn.query("DELETE FROM ai_batches");
    await conn.query("DELETE FROM ai_search_rest");
  });
}

/** Задачам пакетов ставим «искал в интернете»: условие «безопасного» принятия. */
export async function markSearched(): Promise<void> {
  await withDb(async (conn) => {
    await conn.query("UPDATE ai_jobs SET searches = 1 WHERE batch_id IS NOT NULL AND status = 'DONE'");
  });
}

export async function blankDescriptions(ids: readonly string[]): Promise<void> {
  await withDb(async (conn) => {
    await conn.query(`UPDATE products SET description = NULL WHERE id IN (${IN(ids.length)})`, [...ids]);
  });
}
