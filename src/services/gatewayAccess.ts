import { DeviceError } from '../domain/errors';
import { Command, Device, DeviceState, Json } from '../domain/types';
import { haCommand, haState, HaEntity } from '../protocol/homeAssistant';
import { brightnessMax, z2mCommandPayload, z2mState, Z2mExpose } from '../protocol/z2m';

export interface GatewayAccess {
  publish(gatewayId: string, topic: string, payload: string): Promise<void>;
  callService(gatewayId: string, domain: string, service: string, data: Json): Promise<void>;
  readHomeAssistantState(gatewayId: string, entityId: string): Promise<HaEntity | null>;
}

export async function connectThroughGateway(device: Device, access: GatewayAccess): Promise<Device> {
  if (device.protocol === 'zigbee2mqtt') {
    return {
      ...device,
      connectionStatus: 'connected',
      hardwareVerified: device.hardwareVerified,
      lastSeen: Date.now(),
      lastError: undefined,
    };
  }
  if (device.protocol === 'home-assistant') {
    const gatewayId = String(device.protocolData.gatewayId ?? '');
    const entityId = stringList(device.protocolData.entityIds)[0];
    const entity = entityId ? await access.readHomeAssistantState(gatewayId, entityId) : null;
    if (!entity || entity.state === 'unavailable') {
      return {
        ...device,
        connectionStatus: 'offline',
        hardwareVerified: false,
        lastError: 'Home Assistant n’a pas renvoyé d’état pour cet appareil.',
        lastSeen: Date.now(),
      };
    }
    return {
      ...device,
      currentState: haState(entity),
      connectionStatus: 'connected',
      hardwareVerified: true,
      lastSeen: Date.now(),
      lastError: undefined,
    };
  }
  throw new DeviceError(device.compatibilityNote || 'Passerelle absente.', 'unsupported');
}

export async function readGatewayState(device: Device, access: GatewayAccess): Promise<DeviceState> {
  if (device.protocol === 'zigbee2mqtt') {
    const cached = device.currentState;
    return cached;
  }
  if (device.protocol === 'home-assistant') {
    const gatewayId = String(device.protocolData.gatewayId ?? '');
    const entityIds = stringList(device.protocolData.entityIds);
    const entity = entityIds[0] ? await access.readHomeAssistantState(gatewayId, entityIds[0]) : null;
    return haState(entity ?? undefined);
  }
  throw new DeviceError(device.compatibilityNote || 'Passerelle absente.', 'unsupported');
}

export async function commandGateway(device: Device, command: Command, access: GatewayAccess): Promise<DeviceState> {
  if (device.protocol === 'zigbee2mqtt') {
    const gatewayId = String(device.protocolData.gatewayId ?? '');
    const friendlyName = String(device.protocolData.friendlyName ?? '');
    if (!gatewayId || !friendlyName) throw new DeviceError('Appareil Zigbee sans sujet MQTT.', 'unsupported');
    const capability = device.capabilities.find((item) => matches(item.kind, command));
    if (!capability) throw new DeviceError('Cette commande n’est pas dans les exposes Zigbee2MQTT.', 'unsupported');
    const scale = typeof device.protocolData.brightnessMax === 'number' ? device.protocolData.brightnessMax : 255;
    const payload = z2mCommandPayload(command, capability, scale);
    const base = String(device.protocolData.baseTopic ?? 'zigbee2mqtt');
    await access.publish(gatewayId, `${base}/${friendlyName}/set`, JSON.stringify(payload));
    return mergeState(device.currentState, z2mState(payload as Record<string, unknown>, scale));
  }
  if (device.protocol === 'home-assistant') {
    const gatewayId = String(device.protocolData.gatewayId ?? '');
    const entityId = entityFor(device, command);
    const request = haCommand(entityId, command);
    await access.callService(gatewayId, request.domain, request.service, request.data);
    const entity = await access.readHomeAssistantState(gatewayId, entityId);
    return entity ? haState(entity) : device.currentState;
  }
  throw new DeviceError(device.compatibilityNote || 'Aucun protocole commandable.', 'unsupported');
}

export function exposesBrightnessMax(value: Json | undefined): number {
  return brightnessMax((Array.isArray(value) ? value : []) as Z2mExpose[]);
}

function entityFor(device: Device, command: Command): string {
  const entityIds = stringList(device.protocolData.entityIds);
  if (command.type === 'setTargetTemperature' || command.type === 'setMode') {
    const climate = entityIds.find((id) => id.startsWith('climate.'));
    if (!climate) throw new DeviceError('Aucune entité climate importée.', 'unsupported');
    return climate;
  }
  const preferred = entityIds.find((id) => id.startsWith('light.') || id.startsWith('switch.'));
  if (!preferred) throw new DeviceError('Aucune entité commandable importée.', 'unsupported');
  return preferred;
}

function matches(kind: string, command: Command): boolean {
  if (command.type === 'setOnOff') return kind === 'onOff' || kind === 'outlet';
  if (command.type === 'setBrightness') return kind === 'brightness';
  if (command.type === 'setColorHs') return kind === 'colorHs';
  return kind === 'thermostat';
}

function stringList(value: Json | undefined): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function mergeState(previous: DeviceState, patch: DeviceState): DeviceState {
  return {
    ...previous,
    ...patch,
    outlets: patch.outlets ?? previous.outlets,
    availableModes: patch.availableModes ?? previous.availableModes,
  };
}
