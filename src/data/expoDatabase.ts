import * as SQLite from 'expo-sqlite';
import { Platform } from 'react-native';

import { SqlExecutor, SqlValue } from './sql';

export async function openExpoDatabase(): Promise<SqlExecutor> {
  // Le fichier OPFS du navigateur garde un seul accès synchrone. Une deuxième page le fait échouer
  // et peut fermer l’onglet. La session web reste donc en mémoire ; Android conserve maison.db.
  const database = await SQLite.openDatabaseAsync(Platform.OS === 'web' ? ':memory:' : 'maison.db');
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
