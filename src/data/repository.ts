import { Device, Gateway, Group, Json, Room } from '../domain/types';
import { SCHEMA_SQL, SqlExecutor, SqlValue } from './sql';

interface DeviceRow extends Record<string, SqlValue> {
  id: string;
  name: string;
  manufacturer: string;
  model: string;
  firmware_version: string | null;
  type: string;
  protocol: string;
  ip_address: string | null;
  ble_identifier: string | null;
  room_id: string | null;
  capabilities_json: string;
  connection_status: string;
  current_state_json: string;
  is_favorite: number;
  last_seen: number | null;
  simulated: number;
  hardware_verified: number;
  adapter_id: string;
  protocol_data_json: string;
  dedupe_keys_json: string;
  origin: string;
  compatibility_note: string;
  last_error: string | null;
  sort_order: number;
  name_locked: number;
}

export interface HomeSnapshot {
  devices: Device[];
  rooms: Room[];
  groups: Group[];
  gateways: Gateway[];
  preferences: Record<string, Json>;
}

export class HomeRepository {
  constructor(private readonly db: SqlExecutor) {}

  async migrate(): Promise<void> {
    await this.db.exec(SCHEMA_SQL);
  }

  async load(): Promise<HomeSnapshot> {
    const rooms = await this.db.all<Record<string, SqlValue>>('SELECT * FROM rooms ORDER BY sort_order, name');
    const groups = await this.db.all<Record<string, SqlValue>>('SELECT * FROM groups_ ORDER BY sort_order, name');
    const devices = await this.db.all<DeviceRow>('SELECT * FROM devices ORDER BY sort_order, name');
    const memberships = await this.db.all<Record<string, SqlValue>>('SELECT device_id, group_id FROM device_groups');
    const gateways = await this.db.all<Record<string, SqlValue>>('SELECT * FROM gateways ORDER BY name');
    const preferences = await this.db.all<Record<string, SqlValue>>('SELECT key, value_json FROM preferences');
    const groupsByDevice = new Map<string, string[]>();
    for (const membership of memberships) {
      const deviceId = String(membership.device_id);
      const list = groupsByDevice.get(deviceId) ?? [];
      list.push(String(membership.group_id));
      groupsByDevice.set(deviceId, list);
    }
    const mappedDevices = devices.map((row) => this.deviceFromRow(row, groupsByDevice.get(row.id) ?? []));
    const mappedGroups = groups.map((row) => ({
      id: String(row.id),
      name: String(row.name),
      sortOrder: Number(row.sort_order),
      deviceIds: mappedDevices.filter((device) => device.groupIds.includes(String(row.id))).map((device) => device.id),
    }));
    return {
      rooms: rooms.map((row) => ({ id: String(row.id), name: String(row.name), icon: String(row.icon), sortOrder: Number(row.sort_order) })),
      groups: mappedGroups,
      devices: mappedDevices,
      gateways: gateways.map((row) => ({
        id: String(row.id),
        name: String(row.name),
        type: row.type as Gateway['type'],
        address: String(row.address),
        port: Number(row.port),
        tls: row.tls === 1,
        baseTopic: String(row.base_topic),
        username: row.username ? String(row.username) : undefined,
        secretRef: row.secret_ref ? String(row.secret_ref) : undefined,
        connectionStatus: row.connection_status as Gateway['connectionStatus'],
        capabilities: parseJson<string[]>(String(row.capabilities_json), []),
        lastError: row.last_error ? String(row.last_error) : undefined,
      })),
      preferences: Object.fromEntries(preferences.map((row) => [String(row.key), parseJson<Json>(String(row.value_json), null)])),
    };
  }

  async saveDevice(device: Device): Promise<void> {
    await this.db.run(
      `INSERT INTO devices (
        id, name, manufacturer, model, firmware_version, type, protocol, ip_address, ble_identifier, room_id,
        capabilities_json, connection_status, current_state_json, is_favorite, last_seen, simulated, hardware_verified,
        adapter_id, protocol_data_json, dedupe_keys_json, origin, compatibility_note, last_error, sort_order, name_locked
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name, manufacturer = excluded.manufacturer, model = excluded.model,
        firmware_version = excluded.firmware_version, type = excluded.type, protocol = excluded.protocol,
        ip_address = excluded.ip_address, ble_identifier = excluded.ble_identifier, room_id = excluded.room_id,
        capabilities_json = excluded.capabilities_json, connection_status = excluded.connection_status,
        current_state_json = excluded.current_state_json, is_favorite = excluded.is_favorite, last_seen = excluded.last_seen,
        simulated = excluded.simulated, hardware_verified = excluded.hardware_verified, adapter_id = excluded.adapter_id,
        protocol_data_json = excluded.protocol_data_json, dedupe_keys_json = excluded.dedupe_keys_json,
        origin = excluded.origin, compatibility_note = excluded.compatibility_note, last_error = excluded.last_error,
        sort_order = excluded.sort_order, name_locked = excluded.name_locked`,
      [
        device.id, device.name, device.manufacturer, device.model, device.firmwareVersion ?? null, device.type, device.protocol,
        device.ipAddress ?? null, device.bleIdentifier ?? null, device.roomId ?? null, JSON.stringify(device.capabilities),
        device.connectionStatus, JSON.stringify(device.currentState), device.isFavorite ? 1 : 0, device.lastSeen ?? null,
        device.simulated ? 1 : 0, device.hardwareVerified ? 1 : 0, device.adapterId, JSON.stringify(device.protocolData),
        JSON.stringify(device.dedupeKeys), device.origin, device.compatibilityNote, device.lastError ?? null, device.sortOrder,
        device.nameLocked ? 1 : 0,
      ],
    );
    await this.db.run('DELETE FROM device_groups WHERE device_id = ?', [device.id]);
    for (const groupId of device.groupIds) {
      await this.db.run('INSERT OR IGNORE INTO device_groups (device_id, group_id) VALUES (?, ?)', [device.id, groupId]);
    }
  }

  async deleteDevice(id: string): Promise<void> {
    await this.db.run('DELETE FROM devices WHERE id = ?', [id]);
  }

  async deleteSimulated(): Promise<void> {
    await this.db.run('DELETE FROM devices WHERE simulated = 1');
    await this.db.run("DELETE FROM rooms WHERE id LIKE 'sim-room-%'");
    await this.db.run("DELETE FROM groups_ WHERE id LIKE 'sim-group-%'");
  }

  async saveRoom(room: Room): Promise<void> {
    await this.db.run(
      `INSERT INTO rooms (id, name, icon, sort_order) VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, icon = excluded.icon, sort_order = excluded.sort_order`,
      [room.id, room.name, room.icon, room.sortOrder],
    );
  }

  async deleteRoom(id: string): Promise<void> {
    await this.db.run('DELETE FROM rooms WHERE id = ?', [id]);
  }

  async saveGroup(group: Group): Promise<void> {
    await this.db.run(
      `INSERT INTO groups_ (id, name, sort_order) VALUES (?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, sort_order = excluded.sort_order`,
      [group.id, group.name, group.sortOrder],
    );
  }

  async deleteGroup(id: string): Promise<void> {
    await this.db.run('DELETE FROM groups_ WHERE id = ?', [id]);
  }

  async saveGateway(gateway: Gateway): Promise<void> {
    await this.db.run(
      `INSERT INTO gateways (
        id, name, type, address, port, tls, base_topic, username, secret_ref, connection_status, capabilities_json, last_error
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name, type = excluded.type, address = excluded.address, port = excluded.port, tls = excluded.tls,
        base_topic = excluded.base_topic, username = excluded.username, secret_ref = excluded.secret_ref,
        connection_status = excluded.connection_status, capabilities_json = excluded.capabilities_json, last_error = excluded.last_error`,
      [
        gateway.id, gateway.name, gateway.type, gateway.address, gateway.port, gateway.tls ? 1 : 0, gateway.baseTopic,
        gateway.username ?? null, gateway.secretRef ?? null, gateway.connectionStatus, JSON.stringify(gateway.capabilities),
        gateway.lastError ?? null,
      ],
    );
  }

  async deleteGateway(id: string): Promise<void> {
    await this.db.run('DELETE FROM gateways WHERE id = ?', [id]);
  }

  async setPreference(key: string, value: Json): Promise<void> {
    await this.db.run(
      `INSERT INTO preferences (key, value_json) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json`,
      [key, JSON.stringify(value)],
    );
  }

  private deviceFromRow(row: DeviceRow, groupIds: string[]): Device {
    return {
      id: row.id,
      name: row.name,
      manufacturer: row.manufacturer,
      model: row.model,
      firmwareVersion: row.firmware_version ?? undefined,
      type: row.type as Device['type'],
      protocol: row.protocol as Device['protocol'],
      ipAddress: row.ip_address ?? undefined,
      bleIdentifier: row.ble_identifier ?? undefined,
      roomId: row.room_id ?? undefined,
      groupIds,
      capabilities: parseJson(row.capabilities_json, []),
      connectionStatus: row.connection_status as Device['connectionStatus'],
      currentState: parseJson(row.current_state_json, {}),
      isFavorite: row.is_favorite === 1,
      lastSeen: row.last_seen ?? undefined,
      simulated: row.simulated === 1,
      hardwareVerified: row.hardware_verified === 1,
      adapterId: row.adapter_id,
      protocolData: parseJson(row.protocol_data_json, {}),
      dedupeKeys: parseJson(row.dedupe_keys_json, []),
      origin: row.origin as Device['origin'],
      compatibilityNote: row.compatibility_note,
      lastError: row.last_error ?? undefined,
      sortOrder: row.sort_order,
      nameLocked: row.name_locked === 1,
    };
  }
}

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
