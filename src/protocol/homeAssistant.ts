import { DeviceError } from '../domain/errors';
import { Capability, Command, DeviceState, DeviceType, DiscoveryHit, Json } from '../domain/types';

export const HA_IMPORT_PLATFORMS = ['zha', 'mqtt', 'zwave_js'] as const;

export interface HaEntity {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
}

export interface HaRegistryEntity {
  entity_id: string;
  device_id: string | null;
  platform: string;
  original_name?: string | null;
}

export interface HaDevice {
  id: string;
  name: string | null;
  name_by_user?: string | null;
  manufacturer: string | null;
  model: string | null;
  identifiers?: [string, string][];
}

export function haImportMessage(id: number, type: string): Json {
  return { id, type };
}

export function haServiceMessage(id: number, domain: string, service: string, serviceData: Json): Json {
  return { id, type: 'call_service', domain, service, service_data: serviceData };
}

export function haDeviceHit(device: HaDevice, entities: HaRegistryEntity[], states: HaEntity[], gatewayId: string): DiscoveryHit | null {
  const related = entities.filter((entity) => entity.device_id === device.id && HA_IMPORT_PLATFORMS.includes(entity.platform as (typeof HA_IMPORT_PLATFORMS)[number]));
  const controllable = related.filter((entity) => /^(switch|light|climate)\./.test(entity.entity_id));
  if (controllable.length === 0) return null;
  const capabilities = haCapabilities(controllable, states);
  const primary = controllable[0];
  const state = states.find((item) => item.entity_id === primary.entity_id);
  const manufacturer = device.manufacturer || 'Home Assistant';
  const model = device.model || primary.platform;
  return {
    id: `ha:${device.id}`,
    name: device.name_by_user || device.name || primary.original_name || primary.entity_id,
    manufacturer,
    model,
    type: haType(primary.entity_id, model, capabilities),
    protocol: 'home-assistant',
    capabilities,
    connectionStatus: state?.state === 'unavailable' ? 'offline' : 'compatible',
    protocolData: {
      gatewayId,
      deviceId: device.id,
      entityIds: controllable.map((entity) => entity.entity_id),
      platform: primary.platform,
    },
    dedupeKeys: [device.id, ...(device.identifiers ?? []).map((identifier) => identifier.join(':'))],
    adapterId: /stelpro/i.test(manufacturer) ? 'stelpro' : /leviton/i.test(manufacturer) ? 'leviton' : 'zigbee',
    origin: 'gateway',
    compatibilityNote: `Importé depuis Home Assistant (${primary.platform}). Les commandes utilisent l’API locale documentée, pas un protocole inventé pour ${manufacturer}.`,
  };
}

export function haState(entity: HaEntity | undefined): DeviceState {
  if (!entity) return {};
  const attributes = entity.attributes;
  const state: DeviceState = {};
  if (entity.state === 'on') state.on = true;
  if (entity.state === 'off') state.on = false;
  if (typeof attributes.brightness === 'number') state.brightness = Math.round((attributes.brightness / 255) * 100);
  if (typeof attributes.current_temperature === 'number') state.currentTemperatureC = attributes.current_temperature;
  if (typeof attributes.temperature === 'number') state.targetTemperatureC = attributes.temperature;
  if (typeof attributes.humidity === 'number') state.humidity = attributes.humidity;
  if (typeof attributes.hvac_mode === 'string' && attributes.hvac_mode !== 'unavailable') state.mode = attributes.hvac_mode;
  if (Array.isArray(attributes.hvac_modes)) state.availableModes = attributes.hvac_modes.filter((mode): mode is string => typeof mode === 'string');
  if (attributes.hvac_action === 'heating') state.heating = true;
  if (attributes.hvac_action === 'idle' || attributes.hvac_action === 'off') state.heating = false;
  return state;
}

export function haCommand(entityId: string, command: Command): { domain: string; service: string; data: Json } {
  const domain = entityId.split('.')[0];
  if (domain !== 'switch' && domain !== 'light' && domain !== 'climate') {
    throw new DeviceError('Cette entité Home Assistant n’a pas de commande implémentée.', 'unsupported');
  }
  switch (command.type) {
    case 'setOnOff':
      if (domain === 'climate') throw new DeviceError('Un thermostat Home Assistant se commande par consigne ou mode.', 'unsupported');
      return { domain, service: command.on ? 'turn_on' : 'turn_off', data: { entity_id: entityId } };
    case 'setBrightness':
      if (domain !== 'light') throw new DeviceError('brightness_pct est réservé aux lumières Home Assistant.', 'unsupported');
      return { domain, service: 'turn_on', data: { entity_id: entityId, brightness_pct: Math.round(command.brightness) } };
    case 'setColorHs':
      if (domain !== 'light') throw new DeviceError('La couleur n’est envoyée qu’à une lumière Home Assistant.', 'unsupported');
      return { domain, service: 'turn_on', data: { entity_id: entityId, hs_color: [command.hue, command.saturation] } };
    case 'setTargetTemperature':
      if (domain !== 'climate') throw new DeviceError('La consigne exige une entité climate.', 'unsupported');
      return { domain, service: 'set_temperature', data: { entity_id: entityId, temperature: command.celsius } };
    case 'setMode':
      if (domain !== 'climate') throw new DeviceError('Le mode exige une entité climate.', 'unsupported');
      return { domain, service: 'set_hvac_mode', data: { entity_id: entityId, hvac_mode: command.mode } };
    default:
      throw new DeviceError('Commande Home Assistant inconnue.', 'unsupported');
  }
}

function haCapabilities(entities: HaRegistryEntity[], states: HaEntity[]): Capability[] {
  const capabilities: Capability[] = [];
  for (const entity of entities) {
    const domain = entity.entity_id.split('.')[0];
    const state = states.find((item) => item.entity_id === entity.entity_id);
    if (domain === 'switch') capabilities.push({ id: `onOff:${entity.entity_id}`, kind: 'onOff', writable: true, label: entity.entity_id });
    if (domain === 'light') {
      capabilities.push({ id: `onOff:${entity.entity_id}`, kind: 'onOff', writable: true, label: entity.entity_id });
      const supported = state?.attributes.supported_color_modes;
      const modes = Array.isArray(supported) ? supported.map(String) : [];
      if (modes.some((mode) => mode === 'brightness' || mode === 'hs' || mode === 'xy' || mode === 'color_temp')) {
        capabilities.push({ id: 'brightness', kind: 'brightness', writable: true, min: 0, max: 100, step: 1 });
      }
      if (modes.includes('hs')) capabilities.push({ id: 'colorHs', kind: 'colorHs', writable: true });
    }
    if (domain === 'climate') {
      const hvacModes = Array.isArray(state?.attributes.hvac_modes) ? state?.attributes.hvac_modes.filter((mode): mode is string => typeof mode === 'string') : ['off', 'heat'];
      const min = typeof state?.attributes.min_temp === 'number' ? state.attributes.min_temp : 5;
      const max = typeof state?.attributes.max_temp === 'number' ? state.attributes.max_temp : 30;
      capabilities.push({ id: 'thermostat', kind: 'thermostat', writable: true, min, max, step: 0.5, modes: hvacModes });
    }
  }
  return capabilities;
}

function haType(entityId: string, model: string, capabilities: Capability[]): DeviceType {
  if (entityId.startsWith('climate.') || capabilities.some((capability) => capability.kind === 'thermostat')) {
    return /convect|orlean|orléan|sorb|st218/i.test(model) ? 'convector' : 'thermostat';
  }
  if (capabilities.some((capability) => capability.kind === 'colorHs')) return 'light';
  if (capabilities.some((capability) => capability.kind === 'brightness')) return 'dimmer';
  if (entityId.startsWith('switch.')) return 'switch';
  return 'unknown';
}
