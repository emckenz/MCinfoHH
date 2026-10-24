export type SqlValue = string | number | null;

export interface SqlExecutor {
  exec(sql: string): Promise<void>;
  run(sql: string, params?: SqlValue[]): Promise<void>;
  all<T extends Record<string, SqlValue>>(sql: string, params?: SqlValue[]): Promise<T[]>;
}

export const SCHEMA_SQL = `
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS rooms (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  icon TEXT NOT NULL,
  sort_order INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS groups_ (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  manufacturer TEXT NOT NULL,
  model TEXT NOT NULL,
  firmware_version TEXT,
  type TEXT NOT NULL,
  protocol TEXT NOT NULL,
  ip_address TEXT,
  ble_identifier TEXT,
  room_id TEXT REFERENCES rooms(id) ON DELETE SET NULL,
  capabilities_json TEXT NOT NULL,
  connection_status TEXT NOT NULL,
  current_state_json TEXT NOT NULL,
  is_favorite INTEGER NOT NULL,
  last_seen INTEGER,
  simulated INTEGER NOT NULL,
  hardware_verified INTEGER NOT NULL,
  adapter_id TEXT NOT NULL,
  protocol_data_json TEXT NOT NULL,
  dedupe_keys_json TEXT NOT NULL,
  origin TEXT NOT NULL,
  compatibility_note TEXT NOT NULL,
  last_error TEXT,
  sort_order INTEGER NOT NULL,
  name_locked INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS device_groups (
  device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  group_id TEXT NOT NULL REFERENCES groups_(id) ON DELETE CASCADE,
  PRIMARY KEY (device_id, group_id)
);
CREATE TABLE IF NOT EXISTS gateways (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  address TEXT NOT NULL,
  port INTEGER NOT NULL,
  tls INTEGER NOT NULL,
  base_topic TEXT NOT NULL,
  username TEXT,
  secret_ref TEXT,
  connection_status TEXT NOT NULL,
  capabilities_json TEXT NOT NULL,
  last_error TEXT
);
CREATE TABLE IF NOT EXISTS preferences (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL
);
`;
