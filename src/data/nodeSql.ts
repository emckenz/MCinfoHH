import { DatabaseSync } from 'node:sqlite';

import { SqlExecutor, SqlValue } from './sql';

export function nodeSql(database: DatabaseSync = new DatabaseSync(':memory:')): SqlExecutor {
  database.exec('PRAGMA foreign_keys = ON');
  return {
    async exec(sql: string) {
      database.exec(sql);
    },
    async run(sql: string, params: SqlValue[] = []) {
      database.prepare(sql).run(...params);
    },
    async all<T extends Record<string, SqlValue>>(sql: string, params: SqlValue[] = []) {
      return database.prepare(sql).all(...params) as T[];
    },
  };
}
