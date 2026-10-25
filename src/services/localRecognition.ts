import { findDuplicate } from '../domain/dedupe';
import { Device, DiscoveryHit, Protocol } from '../domain/types';
import { DeviceRegistry } from './DeviceRegistry';

const REMEMBERED = new Set<Protocol>(['kasa', 'wemo', 'matter', 'homekit']);

export type LocalProbe = 'kasa' | 'wemo' | 'matter';

export interface RecognitionResult {
  devices: Device[];
  seenIds: string[];
  added: number;
  recognized: number;
  offline: number;
}

function covered(protocol: Protocol, probed: Set<LocalProbe>): boolean {
  if (protocol === 'homekit') return probed.has('matter');
  return probed.has(protocol as LocalProbe);
}

export function recognizeLocalDevices(devices: Device[], hits: DiscoveryHit[], probed: LocalProbe[]): RecognitionResult {
  const registry = new DeviceRegistry();
  registry.replace(devices.map((device) => ({ ...device, currentState: { ...device.currentState }, dedupeKeys: [...device.dedupeKeys], groupIds: [...device.groupIds] })));
  const probedSet = new Set(probed);
  const seen = new Set<string>();
  let added = 0;
  let recognized = 0;
  for (const hit of hits) {
    if (!REMEMBERED.has(hit.protocol)) continue;
    const existing = findDuplicate(registry.list(), [hit.id, ...hit.dedupeKeys]);
    const device = registry.upsertHit(hit);
    seen.add(device.id);
    if (existing) recognized += 1;
    else added += 1;
  }
  let offline = 0;
  for (const device of registry.list()) {
    if (device.simulated || seen.has(device.id)) continue;
    if (!REMEMBERED.has(device.protocol) || !covered(device.protocol, probedSet)) continue;
    if (device.connectionStatus === 'offline') continue;
    registry.save({ ...device, connectionStatus: 'offline' });
    offline += 1;
  }
  return { devices: registry.list(), seenIds: [...seen], added, recognized, offline };
}

export function recognitionMessage(result: Pick<RecognitionResult, 'added' | 'recognized' | 'offline'>): string {
  const parts: string[] = [];
  if (result.added > 0) {
    parts.push(result.added > 1 ? `${result.added} nouveaux appareils enregistrés sur ce téléphone` : '1 nouvel appareil enregistré sur ce téléphone');
  }
  if (result.recognized > 0) {
    parts.push(result.recognized > 1 ? `${result.recognized} appareils déjà connus reconnus` : '1 appareil déjà connu reconnu');
  }
  if (parts.length === 0) {
    parts.push('Aucun appareil Kasa, WeMo, Matter ou HomeKit annoncé sur ce Wi-Fi. La liste déjà enregistrée reste sur le téléphone');
  }
  if (result.offline > 0) {
    parts.push(result.offline > 1 ? `${result.offline} absents marqués hors ligne` : '1 absent marqué hors ligne');
  }
  return `${parts.join('. ')}.`;
}
