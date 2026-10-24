import { Device, DiscoveryHit } from './types';

export function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function findDuplicate(devices: Device[], keys: string[]): Device | undefined {
  const wanted = new Set(keys.map(normalizeKey).filter(Boolean));
  if (wanted.size === 0) return undefined;
  return devices.find((device) => device.dedupeKeys.some((key) => wanted.has(normalizeKey(key))));
}

export function mergeHit(existing: Device, hit: DiscoveryHit): Device {
  return {
    ...existing,
    manufacturer: hit.manufacturer || existing.manufacturer,
    model: hit.model || existing.model,
    firmwareVersion: hit.firmwareVersion ?? existing.firmwareVersion,
    type: hit.type === 'unknown' ? existing.type : hit.type,
    protocol: hit.protocol,
    ipAddress: hit.ipAddress ?? existing.ipAddress,
    bleIdentifier: hit.bleIdentifier ?? existing.bleIdentifier,
    capabilities: hit.capabilities.length > 0 ? hit.capabilities : existing.capabilities,
    connectionStatus: hit.connectionStatus,
    protocolData: { ...existing.protocolData, ...hit.protocolData },
    dedupeKeys: Array.from(new Set([...existing.dedupeKeys, ...hit.dedupeKeys])),
    adapterId: hit.adapterId,
    origin: existing.origin === 'simulation' ? existing.origin : hit.origin,
    compatibilityNote: hit.compatibilityNote,
    lastError: undefined,
    name: existing.nameLocked ? existing.name : hit.name || existing.name,
  };
}
