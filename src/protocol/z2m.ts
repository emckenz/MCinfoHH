import { DeviceError } from '../domain/errors';
import { Capability, Command, DeviceState, DeviceType, DiscoveryHit, Json } from '../domain/types';

export interface Z2mExpose {
  type?: string;
  name?: string;
  features?: Z2mExpose[];
  values?: string[];
  value_min?: number;
  value_max?: number;
  value_step?: number;
  access?: number;
}

export interface Z2mDevice {
  ieee_address?: string;
  friendly_name?: string;
  supported?: boolean;
  manufacturer?: string;
  model_id?: string;
  definition?: {
    model?: string;
    vendor?: string;
    description?: string;
    exposes?: Z2mExpose[];
  } | null;
}

const ACCESS_SET = 0b010;

export function z2mCapabilities(exposes: Z2mExpose[] = []): Capability[] {
  const flat = flatten(exposes);
  const capabilities: Capability[] = [];
  const writable = (expose: Z2mExpose) => expose.access === undefined || (expose.access & ACCESS_SET) !== 0;
  if (flat.some((expose) => expose.name === 'state' || expose.propertyName === 'state')) {
    capabilities.push({ id: 'onOff', kind: 'onOff', writable: true });
  }
  const brightness = flat.find((expose) => expose.name === 'brightness');
  if (brightness) {
    capabilities.push({
      id: 'brightness',
      kind: 'brightness',
      writable: writable(brightness),
      min: 0,
      max: 100,
      step: 1,
    });
  }
  if (flat.some((expose) => expose.name === 'color_hs')) {
    capabilities.push({ id: 'colorHs', kind: 'colorHs', writable: true });
  }
  const climate = exposes.find((expose) => expose.type === 'climate');
  if (climate) {
    const setpoint = climate.features?.find((feature) => feature.name === 'occupied_heating_setpoint');
    const mode = climate.features?.find((feature) => feature.name === 'system_mode');
    capabilities.push({
      id: 'thermostat',
      kind: 'thermostat',
      writable: true,
      min: setpoint?.value_min ?? 5,
      max: setpoint?.value_max ?? 30,
      step: setpoint?.value_step ?? 0.5,
      modes: mode?.values ?? ['off', 'auto', 'heat'],
    });
  }
  return capabilities;
}

export function z2mDeviceType(model: string, description: string, capabilities: Capability[]): DeviceType {
  const hint = `${model} ${description}`.toLowerCase();
  if (capabilities.some((capability) => capability.kind === 'thermostat')) {
    return hint.includes('convector') || hint.includes('orléan') || hint.includes('orlean') || hint.includes('heater') || hint.includes('sorb') || hint.includes('st218')
      ? 'convector'
      : 'thermostat';
  }
  if (capabilities.some((capability) => capability.kind === 'colorHs' || capability.kind === 'brightness') && hint.includes('bulb')) {
    return 'light';
  }
  if (capabilities.some((capability) => capability.kind === 'brightness')) return 'dimmer';
  if (capabilities.some((capability) => capability.kind === 'onOff')) return 'switch';
  return 'unknown';
}

export function z2mHit(device: Z2mDevice, gatewayId: string): DiscoveryHit | null {
  if (!device.ieee_address || !device.friendly_name || device.friendly_name === 'Coordinator') return null;
  const exposes = device.definition?.exposes ?? [];
  const capabilities = z2mCapabilities(exposes);
  const model = device.definition?.model || device.model_id || 'Zigbee';
  const manufacturer = device.definition?.vendor || device.manufacturer || 'Zigbee';
  const description = device.definition?.description || '';
  const stelpro = /stelpro/i.test(manufacturer) || /stelpro/i.test(device.manufacturer ?? '');
  return {
    id: `z2m:${device.ieee_address}`,
    name: device.friendly_name,
    manufacturer,
    model,
    type: z2mDeviceType(model, description, capabilities),
    protocol: 'zigbee2mqtt',
    capabilities,
    connectionStatus: device.supported === false ? 'incompatible' : capabilities.length > 0 ? 'compatible' : 'detected',
    protocolData: {
      gatewayId,
      friendlyName: device.friendly_name,
      ieee: device.ieee_address,
      brightnessMax: brightnessMax(exposes),
    },
    dedupeKeys: [device.ieee_address, device.friendly_name],
    adapterId: stelpro ? 'stelpro' : 'zigbee',
    origin: 'gateway',
    compatibilityNote: device.supported === false
      ? 'Zigbee2MQTT ne fournit pas de définition pour cet appareil. Aucune commande générique n’est inventée.'
      : 'Contrôle via les exposes publiés par Zigbee2MQTT. Non vérifié sur le matériel de cette maison.',
  };
}

export function z2mState(payload: Record<string, unknown>, brightnessScale: number): DeviceState {
  const state: DeviceState = {};
  if (payload.state === 'ON') state.on = true;
  if (payload.state === 'OFF') state.on = false;
  if (typeof payload.brightness === 'number' && brightnessScale > 0) {
    state.brightness = Math.round((payload.brightness / brightnessScale) * 100);
  }
  const color = payload.color as { hue?: number; saturation?: number } | undefined;
  if (color && typeof color.hue === 'number') state.hue = color.hue;
  if (color && typeof color.saturation === 'number') state.saturation = color.saturation;
  if (typeof payload.local_temperature === 'number') state.currentTemperatureC = payload.local_temperature;
  if (typeof payload.occupied_heating_setpoint === 'number') state.targetTemperatureC = payload.occupied_heating_setpoint;
  if (typeof payload.humidity === 'number') state.humidity = payload.humidity;
  if (typeof payload.system_mode === 'string') state.mode = payload.system_mode;
  if (payload.running_state === 'heat') state.heating = true;
  if (payload.running_state === 'idle') state.heating = false;
  return state;
}

export function z2mCommandPayload(command: Command, capability: Capability | undefined, brightnessScale: number): Json {
  switch (command.type) {
    case 'setOnOff':
      return { state: command.on ? 'ON' : 'OFF' };
    case 'setBrightness': {
      const percent = clamp(command.brightness, 0, 100);
      return { state: percent > 0 ? 'ON' : 'OFF', brightness: Math.round((percent / 100) * brightnessScale) };
    }
    case 'setColorHs':
      return { color: { hue: clamp(command.hue, 0, 360), saturation: clamp(command.saturation, 0, 100) } };
    case 'setTargetTemperature': {
      const min = capability?.min ?? 5;
      const max = capability?.max ?? 30;
      if (command.celsius < min || command.celsius > max) {
        throw new DeviceError(`Consigne hors plage documentée (${min} à ${max} °C).`, 'rejected');
      }
      return { occupied_heating_setpoint: command.celsius };
    }
    case 'setMode':
      if (capability?.modes && !capability.modes.includes(command.mode)) {
        throw new DeviceError('Mode absent des exposes de l’appareil.', 'unsupported');
      }
      return { system_mode: command.mode };
    default:
      throw new DeviceError('Commande non prise en charge par Zigbee2MQTT.', 'unsupported');
  }
}

export function brightnessMax(exposes: Z2mExpose[]): number {
  const brightness = flatten(exposes).find((expose) => expose.name === 'brightness');
  return brightness?.value_max ?? 255;
}

interface FlatExpose extends Z2mExpose {
  propertyName?: string;
}

function flatten(exposes: Z2mExpose[]): FlatExpose[] {
  const out: FlatExpose[] = [];
  for (const expose of exposes) {
    out.push({ ...expose, propertyName: expose.name });
    if (expose.features) out.push(...flatten(expose.features));
  }
  return out;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
