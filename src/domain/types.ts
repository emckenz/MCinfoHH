export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

export type ConnectionStatus =
  | 'detected'
  | 'compatible'
  | 'authentication_required'
  | 'connected'
  | 'incompatible'
  | 'offline';

export type DeviceOrigin = 'network' | 'bluetooth' | 'gateway' | 'manual' | 'simulation';

export type DeviceType =
  | 'plug'
  | 'switch'
  | 'dimmer'
  | 'light'
  | 'thermostat'
  | 'convector'
  | 'sensor'
  | 'unknown';

export type Protocol =
  | 'kasa'
  | 'wemo'
  | 'matter'
  | 'homekit'
  | 'ble'
  | 'zigbee2mqtt'
  | 'home-assistant'
  | 'leviton-unconfirmed'
  | 'stelpro-unconfirmed'
  | 'upnp'
  | 'unknown';

export type CapabilityKind =
  | 'onOff'
  | 'brightness'
  | 'colorHs'
  | 'outlet'
  | 'thermostat';

export interface Capability {
  id: string;
  kind: CapabilityKind;
  writable: boolean;
  outletId?: string;
  label?: string;
  min?: number;
  max?: number;
  step?: number;
  modes?: string[];
}

export interface OutletState {
  on: boolean;
  name?: string;
}

export interface DeviceState {
  on?: boolean;
  brightness?: number;
  hue?: number;
  saturation?: number;
  outlets?: Record<string, OutletState>;
  currentTemperatureC?: number;
  targetTemperatureC?: number;
  humidity?: number;
  mode?: string;
  availableModes?: string[];
  heating?: boolean;
}

export interface Device {
  id: string;
  name: string;
  manufacturer: string;
  model: string;
  firmwareVersion?: string;
  type: DeviceType;
  protocol: Protocol;
  ipAddress?: string;
  bleIdentifier?: string;
  roomId?: string;
  groupIds: string[];
  capabilities: Capability[];
  connectionStatus: ConnectionStatus;
  currentState: DeviceState;
  isFavorite: boolean;
  lastSeen?: number;
  simulated: boolean;
  hardwareVerified: boolean;
  adapterId: string;
  protocolData: Record<string, Json>;
  dedupeKeys: string[];
  origin: DeviceOrigin;
  compatibilityNote: string;
  lastError?: string;
  sortOrder: number;
  nameLocked: boolean;
}

export interface Room {
  id: string;
  name: string;
  icon: string;
  sortOrder: number;
}

export interface Group {
  id: string;
  name: string;
  deviceIds: string[];
  sortOrder: number;
}

export type GatewayType = 'zigbee2mqtt' | 'home-assistant';

export interface Gateway {
  id: string;
  name: string;
  type: GatewayType;
  address: string;
  port: number;
  tls: boolean;
  baseTopic: string;
  username?: string;
  secretRef?: string;
  connectionStatus: ConnectionStatus;
  capabilities: string[];
  lastError?: string;
}

export type Command =
  | { type: 'setOnOff'; on: boolean; outletId?: string }
  | { type: 'setBrightness'; brightness: number }
  | { type: 'setColorHs'; hue: number; saturation: number }
  | { type: 'setTargetTemperature'; celsius: number }
  | { type: 'setMode'; mode: string };

export interface DiscoveryHit {
  id: string;
  name: string;
  manufacturer: string;
  model: string;
  firmwareVersion?: string;
  type: DeviceType;
  protocol: Protocol;
  ipAddress?: string;
  bleIdentifier?: string;
  capabilities: Capability[];
  connectionStatus: ConnectionStatus;
  protocolData: Record<string, Json>;
  dedupeKeys: string[];
  adapterId: string;
  origin: Exclude<DeviceOrigin, 'simulation'>;
  compatibilityNote: string;
}

export interface DeviceAdapter {
  id: string;
  manufacturer: string;
  discover(): Promise<DiscoveryHit[]>;
  identify(input: IdentifyInput): Promise<DiscoveryHit | null>;
  authenticate(device: Device, secret: string): Promise<Device>;
  connect(device: Device): Promise<Device>;
  getCapabilities(device: Device): Capability[];
  getState(device: Device): Promise<DeviceState>;
  executeCommand(device: Device, command: Command): Promise<DeviceState>;
  disconnect(device: Device): Promise<void>;
}

export type IdentifyInput = {
  ipAddress?: string;
  model?: string;
  bleIdentifier?: string;
};

export const STATUS_LABEL: Record<ConnectionStatus, string> = {
  detected: 'Détecté',
  compatible: 'Compatible',
  authentication_required: 'Authentification requise',
  connected: 'Connecté',
  incompatible: 'Non compatible',
  offline: 'Hors ligne',
};

export const TYPE_LABEL: Record<DeviceType, string> = {
  plug: 'Prise',
  switch: 'Interrupteur',
  dimmer: 'Gradateur',
  light: 'Éclairage',
  thermostat: 'Thermostat',
  convector: 'Convecteur',
  sensor: 'Capteur',
  unknown: 'Inconnu',
};
