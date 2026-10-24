import { Capability, DeviceType } from '../domain/types';

/** Ports essayés par pywemo lors d'un ajout manuel, pas un balayage du réseau. */
export const WEMO_PROBE_PORTS = [49153, 49152, 49154, 49151, 49155, 49156, 49157, 49158, 49159] as const;

export const WEMO_SEARCH_TARGETS = [
  'urn:Belkin:device:controllee:1',
  'urn:Belkin:device:socket:1',
  'urn:Belkin:device:lightswitch:1',
  'urn:Belkin:device:dimmer:1',
  'urn:Belkin:device:insight:1',
  'urn:Belkin:device:sensor:1',
  'urn:Belkin:device:bridge:1',
  'ssdp:all',
] as const;

export function wemoSearchPayload(searchTarget: string): string {
  return [
    'M-SEARCH * HTTP/1.1',
    'HOST: 239.255.255.250:1900',
    'MAN: "ssdp:discover"',
    'MX: 2',
    `ST: ${searchTarget}`,
    '',
    '',
  ].join('\r\n');
}

export function parseSsdpResponse(raw: string): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const separator = line.indexOf(':');
    if (separator <= 0) continue;
    headers[line.slice(0, separator).trim().toLowerCase()] = line.slice(separator + 1).trim();
  }
  return headers;
}

export interface WemoService {
  serviceType: string;
  serviceId: string;
  controlUrl: string;
  scpdUrl: string;
}

export interface WemoDescription {
  friendlyName: string;
  manufacturer: string;
  modelName: string;
  modelNumber: string;
  modelDescription: string;
  serialNumber: string;
  udn: string;
  macAddress: string;
  firmwareVersion: string;
  deviceType: string;
  services: WemoService[];
}

export function parseSetupXml(xml: string): WemoDescription {
  return {
    friendlyName: tag(xml, 'friendlyName') || 'WeMo',
    manufacturer: tag(xml, 'manufacturer') || 'Belkin',
    modelName: tag(xml, 'modelName') || '',
    modelNumber: tag(xml, 'modelNumber') || '',
    modelDescription: tag(xml, 'modelDescription') || '',
    serialNumber: tag(xml, 'serialNumber') || '',
    udn: tag(xml, 'UDN') || '',
    macAddress: tag(xml, 'macAddress') || '',
    firmwareVersion: tag(xml, 'firmwareVersion') || '',
    deviceType: tag(xml, 'deviceType') || '',
    services: parseServices(xml),
  };
}

export interface WemoAction {
  name: string;
  arguments: string[];
}

export function parseScpdActions(xml: string): WemoAction[] {
  const actions: WemoAction[] = [];
  const blocks = xml.match(/<action>[\s\S]*?<\/action>/gi) ?? [];
  for (const block of blocks) {
    const name = tag(block, 'name');
    if (!name) continue;
    const args = Array.from(block.matchAll(/<name>([^<]+)<\/name>/gi))
      .map((match) => decodeXml(match[1].trim()))
      .filter((value) => value !== name);
    actions.push({ name, arguments: args });
  }
  return actions;
}

export function wemoCapabilities(description: WemoDescription, actions: WemoAction[]): Capability[] {
  const basic = description.services.find((service) => service.serviceType.includes('basicevent'));
  if (!basic) return [];
  const setState = actions.find((action) => action.name === 'SetBinaryState');
  const capabilities: Capability[] = [{ id: 'onOff', kind: 'onOff', writable: Boolean(setState) }];
  const brightnessDeclared = setState?.arguments.some((name) => name.toLowerCase() === 'brightness') ?? false;
  if (brightnessDeclared) {
    capabilities.push({ id: 'brightness', kind: 'brightness', writable: true, min: 0, max: 100, step: 1 });
  }
  return capabilities;
}

export function wemoDeviceType(description: WemoDescription, capabilities: Capability[]): DeviceType {
  const hint = `${description.deviceType} ${description.modelName} ${description.modelDescription}`.toLowerCase();
  if (capabilities.some((capability) => capability.kind === 'brightness') || hint.includes('dimmer')) return 'dimmer';
  if (hint.includes('insight') || hint.includes('socket') || hint.includes('plug')) return 'plug';
  if (hint.includes('light')) return 'light';
  if (hint.includes('sensor')) return 'sensor';
  if (hint.includes('switch') || hint.includes('controllee')) return 'switch';
  return 'switch';
}

export function soapEnvelope(action: string, service: string, params: Record<string, string | number>): string {
  const inner = Object.entries(params)
    .map(([key, value]) => `<${key}>${escapeXml(String(value))}</${key}>`)
    .join('');
  return (
    '<?xml version="1.0" encoding="utf-8"?>' +
    '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">' +
    `<s:Body><u:${action} xmlns:u="${service}">${inner}</u:${action}></s:Body></s:Envelope>`
  );
}

export const WEMO_BASIC_EVENT = 'urn:Belkin:service:basicevent:1';

export function parseBinaryState(xml: string): { on: boolean; brightness?: number; standby: boolean } {
  const raw = tag(xml, 'BinaryState');
  if (!raw) throw new Error('Réponse WeMo sans BinaryState');
  const state = Number(raw.split('|')[0]);
  const brightnessRaw = tag(xml, 'brightness');
  let brightness = brightnessRaw ? Number(brightnessRaw) : undefined;
  if (brightness !== undefined && brightness > 100) brightness = Math.round((brightness / 255) * 100);
  if (state === 1) return { on: true, brightness, standby: false };
  if (state === 0) return { on: false, brightness, standby: false };
  if (state === 8) return { on: true, brightness, standby: true };
  throw new Error(`État WeMo non documenté : ${raw}`);
}

export function isWemoDescription(xml: string): boolean {
  const lowered = xml.toLowerCase();
  return lowered.includes('belkin') || lowered.includes('wemo');
}

function parseServices(xml: string): WemoService[] {
  const blocks = xml.match(/<service>[\s\S]*?<\/service>/gi) ?? [];
  return blocks.map((block) => ({
    serviceType: tag(block, 'serviceType'),
    serviceId: tag(block, 'serviceId'),
    controlUrl: tag(block, 'controlURL'),
    scpdUrl: tag(block, 'SCPDURL'),
  }));
}

function tag(xml: string, name: string): string {
  const match = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
  return match ? decodeXml(match[1].trim()) : '';
}

function decodeXml(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
