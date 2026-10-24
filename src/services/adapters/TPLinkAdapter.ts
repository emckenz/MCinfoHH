import { DeviceError } from '../../domain/errors';
import { assertLanHost } from '../../domain/localAddress';
import { Capability, Command, Device, DeviceState, DeviceType, DiscoveryHit } from '../../domain/types';
import { base64ToBytes, bytesToBase64 } from '../../protocol/bytes';
import {
  assertKasaSuccess,
  decryptKasa,
  encryptKasa,
  frameKasaTcp,
  KASA_SYSINFO_QUERY,
  kasaChildCommandId,
  KasaSysInfo,
  kasaSetDimmerBrightness,
  kasaSetRelayState,
  kasaTransitionLight,
  parseKasaSysInfo,
  unframeKasaTcp,
} from '../../protocol/kasa';
import { NetworkTransport } from '../../transport/types';
import { DeviceAdapter, IdentifyInput } from '../../domain/types';

export class TPLinkAdapter implements DeviceAdapter {
  id = 'tplink';
  manufacturer = 'TP-Link';

  constructor(private readonly transport: NetworkTransport) {}

  async discover(): Promise<DiscoveryHit[]> {
    const network = await this.transport.getActiveNetwork();
    const hosts = ['255.255.255.255'];
    if (network.broadcast && network.broadcast !== '255.255.255.255') hosts.push(network.broadcast);
    const replies = await this.transport.udpCollect(hosts, 9999, bytesToBase64(encryptKasa(KASA_SYSINFO_QUERY)), 3000);
    const hits: DiscoveryHit[] = [];
    for (const reply of replies) {
      try {
        const info = parseKasaSysInfo(decryptKasa(base64ToBytes(reply.payloadBase64)));
        if (!info.deviceId) continue;
        hits.push(this.toHit(info, reply.host));
      } catch {
        continue;
      }
    }
    return dedupe(hits);
  }

  async identify(input: IdentifyInput): Promise<DiscoveryHit | null> {
    if (!input.ipAddress) return null;
    assertLanHost(input.ipAddress);
    try {
      const info = await this.query(input.ipAddress);
      return this.toHit(info, input.ipAddress);
    } catch {
      return null;
    }
  }

  async authenticate(): Promise<Device> {
    throw new DeviceError('Le protocole Kasa KLAP, qui demande une authentification, n’est pas implémenté.', 'auth');
  }

  async connect(device: Device): Promise<Device> {
    const state = await this.getState(device);
    return { ...device, currentState: state, connectionStatus: 'connected', hardwareVerified: true, lastSeen: Date.now(), lastError: undefined };
  }

  getCapabilities(device: Device): Capability[] {
    return device.capabilities;
  }

  async getState(device: Device): Promise<DeviceState> {
    const info = await this.query(requiredIp(device));
    return stateFromInfo(info);
  }

  async executeCommand(device: Device, command: Command): Promise<DeviceState> {
    const ip = requiredIp(device);
    const info = device.protocolData.deviceId ? null : await this.query(ip);
    const deviceId = String(device.protocolData.deviceId ?? info?.deviceId ?? '');
    if (command.type === 'setOnOff' && command.outletId) {
      const child = device.capabilities.find((capability) => capability.kind === 'outlet' && capability.outletId === command.outletId);
      if (!child) throw new DeviceError('Cette sortie n’est pas déclarée par le KP400.', 'unsupported');
      await this.send(ip, kasaSetRelayState(command.on ? 1 : 0, [kasaChildCommandId(deviceId, command.outletId)]));
    } else if (command.type === 'setOnOff') {
      if (device.capabilities.some((capability) => capability.kind === 'outlet')) {
        throw new DeviceError('Une prise à plusieurs sorties se commande sortie par sortie.', 'unsupported');
      }
      if (device.capabilities.some((capability) => capability.id === 'light')) {
        await this.send(ip, kasaTransitionLight({ on_off: command.on ? 1 : 0 }));
      } else {
        await this.send(ip, kasaSetRelayState(command.on ? 1 : 0));
      }
    } else if (command.type === 'setBrightness') {
      if (!device.capabilities.some((capability) => capability.kind === 'brightness')) {
        throw new DeviceError('Cet appareil Kasa n’a pas exposé d’intensité.', 'unsupported');
      }
      const brightness = Math.round(Math.min(100, Math.max(0, command.brightness)));
      if (device.capabilities.some((capability) => capability.id === 'light')) {
        await this.send(ip, kasaTransitionLight({ on_off: brightness > 0 ? 1 : 0, brightness }));
      } else {
        await this.send(ip, kasaSetDimmerBrightness(brightness));
      }
    } else if (command.type === 'setColorHs') {
      if (!device.capabilities.some((capability) => capability.kind === 'colorHs')) {
        throw new DeviceError('Cet appareil Kasa n’a pas exposé de couleur.', 'unsupported');
      }
      await this.send(ip, kasaTransitionLight({
        on_off: 1,
        hue: Math.round(command.hue),
        saturation: Math.round(command.saturation),
      }));
    } else {
      throw new DeviceError('Commande incompatible avec le protocole Kasa historique.', 'unsupported');
    }
    return this.getState({ ...device, ipAddress: ip });
  }

  async disconnect(): Promise<void> {
    return;
  }

  private async query(ip: string): Promise<KasaSysInfo> {
    const payload = await this.transport.tcpExchange(ip, 9999, bytesToBase64(frameKasaTcp(KASA_SYSINFO_QUERY)), 3000, 'kasa');
    return parseKasaSysInfo(unframeKasaTcp(base64ToBytes(payload)));
  }

  private async send(ip: string, command: unknown): Promise<void> {
    const plain = JSON.stringify(command);
    const payload = await this.transport.tcpExchange(ip, 9999, bytesToBase64(frameKasaTcp(plain)), 3000, 'kasa');
    assertKasaSuccess(unframeKasaTcp(base64ToBytes(payload)));
  }

  private toHit(info: KasaSysInfo, ip: string): DiscoveryHit {
    const capabilities = capabilitiesFromInfo(info);
    return {
      id: `kasa:${info.deviceId}`,
      name: info.alias || info.model,
      manufacturer: 'TP-Link',
      model: info.model,
      firmwareVersion: info.firmwareVersion,
      type: typeFromInfo(info, capabilities),
      protocol: 'kasa',
      ipAddress: ip,
      capabilities,
      connectionStatus: 'compatible',
      protocolData: {
        deviceId: info.deviceId,
        mac: info.mac ?? null,
        micType: info.micType ?? null,
        childIds: info.children.map((child) => child.id),
      },
      dedupeKeys: [info.deviceId, info.mac].filter((value): value is string => Boolean(value)),
      adapterId: 'tplink',
      origin: 'network',
      compatibilityNote: info.model.toUpperCase().includes('KP400')
        ? 'KP400 détecté par le protocole Kasa historique. Le contrôle des sorties n’a pas encore été confirmé sur cet appareil.'
        : 'Appareil Kasa historique détecté. Le contrôle n’a pas encore été confirmé sur cet appareil. Le protocole KLAP n’est pas implémenté.',
    };
  }
}

function requiredIp(device: Device): string {
  if (!device.ipAddress) throw new DeviceError('Adresse IP Kasa absente.', 'offline');
  assertLanHost(device.ipAddress);
  return device.ipAddress;
}

function capabilitiesFromInfo(info: KasaSysInfo): Capability[] {
  if (info.children.length > 0) {
    return info.children.map((child) => ({
      id: `outlet-${child.id}`,
      kind: 'outlet' as const,
      writable: true,
      outletId: child.id,
      label: child.alias || `Sortie ${child.id}`,
    }));
  }
  const capabilities: Capability[] = [];
  if (info.lightState) {
    capabilities.push({ id: 'light', kind: 'onOff', writable: true });
    if (typeof info.lightState.brightness === 'number') {
      capabilities.push({ id: 'brightness', kind: 'brightness', writable: true, min: 0, max: 100, step: 1 });
    }
    if (typeof info.lightState.hue === 'number' && typeof info.lightState.saturation === 'number') {
      capabilities.push({ id: 'colorHs', kind: 'colorHs', writable: true });
    }
    return capabilities;
  }
  if (typeof info.relayState === 'number' || info.micType?.includes('PLUG') || info.micType?.includes('SWITCH')) {
    capabilities.push({ id: 'onOff', kind: 'onOff', writable: true });
  }
  if (typeof info.brightness === 'number') {
    capabilities.push({ id: 'brightness', kind: 'brightness', writable: true, min: 0, max: 100, step: 1 });
  }
  return capabilities;
}

function typeFromInfo(info: KasaSysInfo, capabilities: Capability[]): DeviceType {
  if (info.children.length > 0 || info.model.toUpperCase().includes('KP400')) return 'plug';
  if (info.lightState) return 'light';
  if (capabilities.some((capability) => capability.kind === 'brightness')) return 'dimmer';
  if (info.micType?.includes('BULB')) return 'light';
  return 'plug';
}

function stateFromInfo(info: KasaSysInfo): DeviceState {
  if (info.children.length > 0) {
    const outlets: DeviceState['outlets'] = {};
    for (const child of info.children) {
      outlets[child.id] = { on: child.state === 1, name: child.alias };
    }
    return { outlets, on: Object.values(outlets).some((outlet) => outlet.on) };
  }
  if (info.lightState) {
    return {
      on: info.lightState.onOff === 1,
      brightness: info.lightState.brightness,
      hue: info.lightState.hue,
      saturation: info.lightState.saturation,
    };
  }
  return { on: info.relayState === 1, brightness: info.brightness };
}

function dedupe(hits: DiscoveryHit[]): DiscoveryHit[] {
  const seen = new Set<string>();
  return hits.filter((hit) => {
    if (seen.has(hit.id)) return false;
    seen.add(hit.id);
    return true;
  });
}
