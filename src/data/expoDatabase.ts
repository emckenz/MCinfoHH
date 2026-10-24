import * as SQLite from 'expo-sqlite';

import { SqlExecutor, SqlValue } from './sql';

export async function openExpoDatabase(): Promise<SqlExecutor> {
  const database = await SQLite.openDatabaseAsync('maison.db');
  await database.execAsync('PRAGMA foreign_keys = ON');
  return {
    async exec(sql: string) {
      await database.execAsync(sql);
    },
    async run(sql: string, params: SqlValue[] = []) {
      await database.runAsync(sql, ...params);
    },
    async all<T extends Record<string, SqlValue>>(sql: string, params: SqlValue[] = []) {
      return database.getAllAsync<T>(sql, ...params);
    },
  };
}
