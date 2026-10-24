import { findDuplicate, mergeHit } from '../domain/dedupe';
import { Device, DiscoveryHit, Group, Room } from '../domain/types';

export function hitToDevice(hit: DiscoveryHit, sortOrder = 0): Device {
  return {
    id: hit.id,
    name: hit.name,
    manufacturer: hit.manufacturer,
    model: hit.model,
    firmwareVersion: hit.firmwareVersion,
    type: hit.type,
    protocol: hit.protocol,
    ipAddress: hit.ipAddress,
    bleIdentifier: hit.bleIdentifier,
    groupIds: [],
    capabilities: hit.capabilities,
    connectionStatus: hit.connectionStatus,
    currentState: {},
    isFavorite: false,
    simulated: false,
    hardwareVerified: false,
    adapterId: hit.adapterId,
    protocolData: hit.protocolData,
    dedupeKeys: hit.dedupeKeys,
    origin: hit.origin,
    compatibilityNote: hit.compatibilityNote,
    sortOrder,
    nameLocked: false,
  };
}

export class DeviceRegistry {
  private devices: Device[] = [];

  replace(devices: Device[]): void {
    this.devices = devices;
  }

  list(): Device[] {
    return this.devices;
  }

  get(id: string): Device | undefined {
    return this.devices.find((device) => device.id === id);
  }

  upsertHit(hit: DiscoveryHit): Device {
    const duplicate = findDuplicate(this.devices, [hit.id, ...hit.dedupeKeys]);
    if (duplicate) {
      const merged = mergeHit(duplicate, hit);
      this.devices = this.devices.map((device) => (device.id === duplicate.id ? merged : device));
      return merged;
    }
    const created = hitToDevice(hit, this.devices.length);
    this.devices = [...this.devices, created];
    return created;
  }

  save(device: Device): void {
    const index = this.devices.findIndex((item) => item.id === device.id);
    if (index < 0) this.devices = [...this.devices, device];
    else this.devices = this.devices.map((item) => (item.id === device.id ? device : item));
  }

  remove(id: string): void {
    this.devices = this.devices.filter((device) => device.id !== id);
  }

  assignRoom(deviceId: string, roomId?: string): void {
    this.devices = this.devices.map((device) => (device.id === deviceId ? { ...device, roomId } : device));
  }

  setGroup(deviceId: string, groupId: string, member: boolean): void {
    this.devices = this.devices.map((device) => {
      if (device.id !== deviceId) return device;
      const groupIds = member ? Array.from(new Set([...device.groupIds, groupId])) : device.groupIds.filter((id) => id !== groupId);
      return { ...device, groupIds };
    });
  }

  clearRoom(roomId: string): void {
    this.devices = this.devices.map((device) => (device.roomId === roomId ? { ...device, roomId: undefined } : device));
  }

  clearGroup(groupId: string): void {
    this.devices = this.devices.map((device) => ({ ...device, groupIds: device.groupIds.filter((id) => id !== groupId) }));
  }
}

export function devicesInRoom(devices: Device[], roomId: string): Device[] {
  return devices.filter((device) => device.roomId === roomId).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

export function devicesInGroup(devices: Device[], groupId: string): Device[] {
  return devices.filter((device) => device.groupIds.includes(groupId)).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

export function withMembership(groups: Group[], devices: Device[]): Group[] {
  return groups.map((group) => ({ ...group, deviceIds: devices.filter((device) => device.groupIds.includes(group.id)).map((device) => device.id) }));
}

export function reorderWithin(devices: Device[], orderedIds: string[]): Device[] {
  const positions = new Map(orderedIds.map((id, index) => [id, index]));
  return devices.map((device) => (positions.has(device.id) ? { ...device, sortOrder: positions.get(device.id) ?? device.sortOrder } : device));
}

export function roomById(rooms: Room[], id?: string): Room | undefined {
  return rooms.find((room) => room.id === id);
}
