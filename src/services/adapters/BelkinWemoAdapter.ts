import { DeviceError } from '../../domain/errors';
import { assertLanHost } from '../../domain/localAddress';
import { Capability, Command, Device, DeviceAdapter, DeviceState, DiscoveryHit, IdentifyInput } from '../../domain/types';
import {
  isWemoDescription,
  parseBinaryState,
  parseScpdActions,
  parseSetupXml,
  parseSsdpResponse,
  soapEnvelope,
  WEMO_BASIC_EVENT,
  WEMO_PROBE_PORTS,
  WEMO_SEARCH_TARGETS,
  wemoCapabilities,
  wemoDeviceType,
  WemoDescription,
  wemoSearchPayload,
} from '../../protocol/wemo';
import { NetworkTransport } from '../../transport/types';

export class BelkinWemoAdapter implements DeviceAdapter {
  id = 'wemo';
  manufacturer = 'Belkin';

  constructor(private readonly transport: NetworkTransport) {}

  async discover(): Promise<DiscoveryHit[]> {
    const payloads = WEMO_SEARCH_TARGETS.map((target) => wemoSearchPayload(target));
    const replies = await this.transport.ssdpSearch(payloads, 3000);
    const locations = new Set<string>();
    for (const reply of replies) {
      const location = parseSsdpResponse(reply).location;
      if (location && /^http:\/\//i.test(location)) locations.add(location);
    }
    const hits: DiscoveryHit[] = [];
    for (const location of locations) {
      const hit = await this.hitFromLocation(location);
      if (hit) hits.push(hit);
    }
    return hits;
  }

  async identify(input: IdentifyInput): Promise<DiscoveryHit | null> {
    if (!input.ipAddress) return null;
    assertLanHost(input.ipAddress);
    for (const port of WEMO_PROBE_PORTS) {
      const hit = await this.hitFromLocation(`http://${input.ipAddress}:${port}/setup.xml`);
      if (hit) return hit;
    }
    return null;
  }

  async authenticate(device: Device): Promise<Device> {
    return device;
  }

  async connect(device: Device): Promise<Device> {
    const state = await this.getState(device);
    return { ...device, currentState: state, connectionStatus: 'connected', hardwareVerified: true, lastSeen: Date.now(), lastError: undefined };
  }

  getCapabilities(device: Device): Capability[] {
    return device.capabilities;
  }

  async getState(device: Device): Promise<DeviceState> {
    const xml = await this.soap(device, 'GetBinaryState', {});
    const parsed = parseBinaryState(xml);
    return { on: parsed.on, brightness: parsed.brightness };
  }

  async executeCommand(device: Device, command: Command): Promise<DeviceState> {
    if (command.type === 'setOnOff') {
      if (!device.capabilities.some((capability) => capability.kind === 'onOff')) {
        throw new DeviceError('Ce WeMo n’annonce pas SetBinaryState.', 'unsupported');
      }
      await this.soap(device, 'SetBinaryState', { BinaryState: command.on ? 1 : 0 });
    } else if (command.type === 'setBrightness') {
      if (!device.capabilities.some((capability) => capability.kind === 'brightness')) {
        throw new DeviceError('L’intensité n’est pas déclarée dans la description de ce WeMo.', 'unsupported');
      }
      const brightness = Math.round(Math.min(100, Math.max(0, command.brightness)));
      await this.soap(device, 'SetBinaryState', { BinaryState: brightness > 0 ? 1 : 0, brightness });
    } else {
      throw new DeviceError('Commande absente des services WeMo annoncés.', 'unsupported');
    }
    return this.getState(device);
  }

  async disconnect(): Promise<void> {
    return;
  }

  private async hitFromLocation(location: string): Promise<DiscoveryHit | null> {
    let hostname = '';
    try {
      hostname = new URL(location).hostname;
      assertLanHost(hostname);
    } catch {
      return null;
    }
    let response;
    try {
      response = await this.transport.httpRequest(location, { method: 'GET', timeoutMs: 1500 });
    } catch {
      return null;
    }
    if (response.status !== 200 || !isWemoDescription(response.body)) return null;
    const description = parseSetupXml(response.body);
    const actions = await this.loadActions(location, description);
    const capabilities = wemoCapabilities(description, actions);
    const base = location.replace(/\/setup\.xml$/i, '');
    return {
      id: `wemo:${description.udn || description.serialNumber || hostname}`,
      name: description.friendlyName,
      manufacturer: description.manufacturer || 'Belkin',
      model: [description.modelName, description.modelNumber].filter(Boolean).join(' ') || 'WeMo',
      firmwareVersion: description.firmwareVersion || undefined,
      type: wemoDeviceType(description, capabilities),
      protocol: 'wemo',
      ipAddress: hostname,
      capabilities,
      connectionStatus: capabilities.length > 0 ? 'compatible' : 'detected',
      protocolData: {
        setupUrl: location,
        baseUrl: base,
        udn: description.udn,
        mac: description.macAddress || null,
        deviceType: description.deviceType,
        controlPath: description.services.find((service) => service.serviceType.includes('basicevent'))?.controlUrl ?? '/upnp/control/basicevent1',
      },
      dedupeKeys: [description.udn, description.macAddress, description.serialNumber].filter(Boolean),
      adapterId: 'wemo',
      origin: 'network',
      compatibilityNote: capabilities.some((capability) => capability.kind === 'brightness')
        ? 'WeMo identifié. L’intensité est disponible parce que le descripteur SCPD annonce brightness.'
        : 'WeMo identifié à partir de ses services UPnP. Les autres modèles ne reçoivent pas de commande d’intensité.',
    };
  }

  private async loadActions(location: string, description: WemoDescription) {
    const service = description.services.find((item) => item.serviceType.includes('basicevent'));
    if (!service?.scpdUrl) return [];
    const base = location.replace(/\/setup\.xml$/i, '');
    const url = service.scpdUrl.startsWith('http') ? service.scpdUrl : `${base}${service.scpdUrl}`;
    try {
      const response = await this.transport.httpRequest(url, { method: 'GET', timeoutMs: 1500 });
      if (response.status !== 200) return [];
      return parseScpdActions(response.body);
    } catch {
      return [];
    }
  }

  private async soap(device: Device, action: string, params: Record<string, string | number>): Promise<string> {
    const base = String(device.protocolData.baseUrl ?? '');
    const control = String(device.protocolData.controlPath ?? '/upnp/control/basicevent1');
    if (!base) throw new DeviceError('URL de contrôle WeMo absente. Relancez l’identification.', 'offline');
    const response = await this.transport.httpRequest(`${base}${control}`, {
      method: 'POST',
      timeoutMs: 3000,
      headers: {
        'Content-Type': 'text/xml; charset="utf-8"',
        SOAPACTION: `"${WEMO_BASIC_EVENT}#${action}"`,
      },
      body: soapEnvelope(action, WEMO_BASIC_EVENT, params),
    });
    if (response.status < 200 || response.status >= 300) {
      throw new DeviceError(`Le WeMo a répondu HTTP ${response.status}.`, 'rejected');
    }
    return response.body;
  }
}
