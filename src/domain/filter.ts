import { Device, DeviceType } from './types';

export interface DeviceFilters {
  query: string;
  types: DeviceType[];
  manufacturers: string[];
  roomIds: string[];
  groupIds: string[];
  connection: 'all' | 'connected' | 'offline' | 'other';
  power: 'all' | 'on' | 'off';
  favoritesOnly: boolean;
}

export const EMPTY_FILTERS: DeviceFilters = {
  query: '',
  types: [],
  manufacturers: [],
  roomIds: [],
  groupIds: [],
  connection: 'all',
  power: 'all',
  favoritesOnly: false,
};

export function isPoweredOn(device: Device): boolean {
  if (device.currentState.on) return true;
  return Object.values(device.currentState.outlets ?? {}).some((outlet) => outlet.on);
}

export function hasPowerControl(device: Device): boolean {
  return device.capabilities.some((capability) => capability.kind === 'onOff' || capability.kind === 'outlet');
}

export function filterDevices(
  devices: Device[],
  filters: DeviceFilters,
  roomNames: Record<string, string> = {},
): Device[] {
  const query = filters.query.trim().toLowerCase();
  return devices.filter((device) => {
    if (filters.favoritesOnly && !device.isFavorite) return false;
    if (filters.types.length > 0 && !filters.types.includes(device.type)) return false;
    if (filters.manufacturers.length > 0 && !filters.manufacturers.includes(device.manufacturer)) return false;
    if (filters.roomIds.length > 0 && (!device.roomId || !filters.roomIds.includes(device.roomId))) return false;
    if (filters.groupIds.length > 0 && !device.groupIds.some((id) => filters.groupIds.includes(id))) return false;
    if (filters.connection === 'connected' && device.connectionStatus !== 'connected') return false;
    if (filters.connection === 'offline' && device.connectionStatus !== 'offline') return false;
    if (filters.connection === 'other' && (device.connectionStatus === 'connected' || device.connectionStatus === 'offline')) {
      return false;
    }
    if (filters.power === 'on' && !isPoweredOn(device)) return false;
    if (filters.power === 'off' && (!hasPowerControl(device) || isPoweredOn(device))) return false;
    if (!query) return true;
    const room = device.roomId ? roomNames[device.roomId] ?? '' : '';
    const haystack = [device.name, device.manufacturer, device.model, device.type, room, device.protocol]
      .join(' ')
      .toLowerCase();
    return haystack.includes(query);
  });
}
