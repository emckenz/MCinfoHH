import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { nodeSql } from '../src/data/nodeSql';
import { HomeRepository } from '../src/data/repository';
import { findDuplicate } from '../src/domain/dedupe';
import { DeviceError } from '../src/domain/errors';
import { filterDevices } from '../src/domain/filter';
import { Command, Device, DeviceAdapter, DeviceState, DiscoveryHit } from '../src/domain/types';
import { base64ToBytes, bytesToBase64 } from '../src/protocol/bytes';
import { encryptKasa, frameKasaTcp, unframeKasaTcp } from '../src/protocol/kasa';
import { applySimulatedCommand } from '../src/demo/simulate';
import { connectThroughGateway } from '../src/services/gatewayAccess';
import { createHomeServices } from '../src/services/createHomeServices';
import { DeviceAdapterRegistry } from '../src/services/DeviceAdapterRegistry';
import { DeviceCommandService } from '../src/services/DeviceCommandService';
import { DeviceConnectionManager } from '../src/services/DeviceConnectionManager';
import { devicesInGroup, DeviceRegistry } from '../src/services/DeviceRegistry';
import { NetworkTransport } from '../src/transport/types';

const kp400 = {
  system: {
    get_sysinfo: {
      model: 'KP400(US)',
      deviceId: 'ABC',
      alias: 'Prise patio',
      sw_ver: '1.0.6',
      mac: 'AA:BB:CC:DD:EE:FF',
      mic_type: 'IOT.SMARTPLUGSWITCH',
      children: [
        { id: '00', state: 1, alias: 'Lampe' },
        { id: '01', state: 0, alias: 'Ventilo' },
      ],
    },
  },
};

function transport(): NetworkTransport & { tcpCalls: string[] } {
  const tcpCalls: string[] = [];
  return {
    tcpCalls,
    async getActiveNetwork() {
      return { connected: true, ssid: 'maison', ipAddress: '192.168.1.20', prefixLength: 24, interfaceName: 'wlan0', transport: 'wifi', frequencyMhz: 5200, vpn: false, broadcast: '192.168.1.255' };
    },
    async udpCollect() {
      return [{ host: '192.168.1.50', port: 9999, payloadBase64: bytesToBase64(encryptKasa(JSON.stringify(kp400))) }];
    },
    async tcpExchange(_host, _port, payload) {
      const plain = unframeKasaTcp(base64ToBytes(payload));
      tcpCalls.push(plain);
      const message = JSON.parse(plain) as { system?: { set_relay_state?: { state: number } }; context?: { child_ids?: string[] } };
      if (message.system?.set_relay_state) {
        const child = message.context?.child_ids?.[0];
        if (child !== 'ABC00' && child !== 'ABC01') {
          return bytesToBase64(frameKasaTcp(JSON.stringify({ system: { set_relay_state: { err_code: 1 } } })));
        }
        return bytesToBase64(frameKasaTcp(JSON.stringify({ system: { set_relay_state: { err_code: 0 } } })));
      }
      return bytesToBase64(frameKasaTcp(JSON.stringify(kp400)));
    },
    async ssdpSearch() {
      return [
        'HTTP/1.1 200 OK\r\nLOCATION: http://192.168.1.30:49153/setup.xml\r\nST: urn:Belkin:device:lightswitch:1\r\n',
        'HTTP/1.1 200 OK\r\nLOCATION: http://192.168.1.31:49153/setup.xml\r\nST: urn:Belkin:device:dimmer:1\r\n',
      ];
    },
    async mdnsBrowse() {
      return [{ name: 'Matter', type: '_matterc._udp.', host: '192.168.1.40', port: 5540, txt: { DN: 'Veilleuse', D: '12' } }];
    },
    async bleScan() {
      return [{ address: '11:22:33:44:55:66', name: 'Capteur', rssi: -60, serviceUuids: [], manufacturerIds: [] }];
    },
    async bleInspect() {
      throw new Error('non utilisé');
    },
    async listUsbDevices() {
      return [];
    },
    async httpRequest(url) {
      if (url.includes('192.168.1.30') && url.endsWith('setup.xml')) {
        return { status: 200, body: wemoXml('Interrupteur', 'LightSwitch', 'urn:Belkin:device:lightswitch:1', 'uuid:switch-1', 'AA:BB:CC:DD:EE:10') };
      }
      if (url.includes('192.168.1.31') && url.endsWith('setup.xml')) {
        return { status: 200, body: wemoXml('Gradateur', 'Dimmer', 'urn:Belkin:device:dimmer:1', 'uuid:dimmer-1', 'AA:BB:CC:DD:EE:11') };
      }
      if (url.includes('192.168.1.31') && url.includes('eventservice')) {
        return { status: 200, body: '<scpd><action><name>SetBinaryState</name><argument><name>BinaryState</name></argument><argument><name>brightness</name></argument></action></scpd>' };
      }
      if (url.includes('eventservice')) {
        return { status: 200, body: '<scpd><action><name>SetBinaryState</name><argument><name>BinaryState</name></argument></action></scpd>' };
      }
      if (url.includes('SetBinaryState') || url.includes('basicevent')) {
        return { status: 200, body: '<s:Envelope><BinaryState>1</BinaryState></s:Envelope>' };
      }
      return { status: 404, body: '' };
    },
    async openSocket() {
      throw new Error('socket non utilisé');
    },
  };
}

function wemoXml(name: string, model: string, deviceType: string, udn: string, mac: string): string {
  return `<?xml version="1.0"?><root><device><friendlyName>${name}</friendlyName><manufacturer>Belkin International Inc.</manufacturer><modelName>${model}</modelName><deviceType>${deviceType}</deviceType><UDN>${udn}</UDN><macAddress>${mac}</macAddress><serviceList><service><serviceType>urn:Belkin:service:basicevent:1</serviceType><controlURL>/upnp/control/basicevent1</controlURL><SCPDURL>/eventservice.xml</SCPDURL></service></serviceList></device></root>`;
}

function device(partial: Partial<Device>): Device {
  return {
    id: 'device-1',
    name: 'Lampe',
    manufacturer: 'TP-Link',
    model: 'KP400',
    type: 'plug',
    protocol: 'kasa',
    groupIds: [],
    capabilities: [{ id: 'onOff', kind: 'onOff', writable: true }],
    connectionStatus: 'connected',
    currentState: { on: false },
    isFavorite: false,
    simulated: false,
    hardwareVerified: false,
    adapterId: 'tplink',
    protocolData: {},
    dedupeKeys: ['device-1'],
    origin: 'network',
    compatibilityNote: '',
    sortOrder: 0,
    nameLocked: false,
    ...partial,
  };
}

describe('découverte et déduplication', () => {
  it('classe Kasa, WeMo et Matter sans les confondre', async () => {
    const net = transport();
    const services = createHomeServices(net);
    const hits = await services.discovery.discover('auto', () => undefined);
    const kasa = hits.find((hit) => hit.model.includes('KP400'));
    const switchHit = hits.find((hit) => hit.name === 'Interrupteur');
    const dimmer = hits.find((hit) => hit.name === 'Gradateur');
    const matter = hits.find((hit) => hit.protocol === 'matter');
    const ble = hits.find((hit) => hit.protocol === 'ble');
    assert.ok(kasa);
    assert.deepEqual(kasa?.capabilities.map((capability) => capability.outletId), ['00', '01']);
    assert.equal(switchHit?.capabilities.some((capability) => capability.kind === 'brightness'), false);
    assert.equal(dimmer?.capabilities.some((capability) => capability.kind === 'brightness'), true);
    assert.equal(matter?.capabilities.length, 0);
    assert.equal(ble?.connectionStatus, 'detected');
    assert.equal(ble?.capabilities.length, 0);

    const failing = transport();
    failing.udpCollect = async () => {
      throw new Error('development build Android');
    };
    failing.ssdpSearch = async () => {
      throw new Error('development build Android');
    };
    failing.mdnsBrowse = async () => {
      throw new Error('development build Android');
    };
    await assert.rejects(() => createHomeServices(failing).discovery.discover('wifi', () => undefined), /development build Android/);

    const registry = new DeviceRegistry();
    registry.upsertHit(kasa as DiscoveryHit);
    registry.upsertHit({ ...(kasa as DiscoveryHit), name: 'Autre nom', dedupeKeys: ['aa-bb-cc-dd-ee-ff'] });
    assert.equal(registry.list().length, 1);
    assert.equal(findDuplicate(registry.list(), ['AA:BB:CC:DD:EE:FF'])?.id, 'kasa:ABC');
  });
});

describe('commandes et erreurs', () => {
  it('envoie la sortie KP400 et refuse un err_code', async () => {
    const net = transport();
    const services = createHomeServices(net);
    const [hit] = await services.adapters.get('tplink').discover();
    let current = await services.adapters.get('tplink').connect(device({
      id: hit.id,
      ipAddress: hit.ipAddress,
      capabilities: hit.capabilities,
      protocolData: hit.protocolData,
      model: hit.model,
    }));
    current = { ...current, currentState: await services.commands.execute(current, { type: 'setOnOff', on: true, outletId: '00' }).then((item) => item.currentState) };
    assert.match(net.tcpCalls.at(-2) ?? '', /ABC00/);
    await assert.rejects(() => services.adapters.get('tplink').executeCommand(current, { type: 'setOnOff', on: true }), /plusieurs sorties|Sortie/);
  });

  it('ne contacte pas le réseau pour une simulation et conserve l’état si la commande échoue', async () => {
    const net = transport();
    const services = createHomeServices(net);
    const simulated = device({
      simulated: true,
      origin: 'simulation',
      capabilities: [
        { id: 'outlet-00', kind: 'outlet', writable: true, outletId: '00' },
        { id: 'outlet-01', kind: 'outlet', writable: true, outletId: '01' },
      ],
      currentState: { outlets: { '00': { on: false }, '01': { on: false } } },
    });
    const updated = await services.commands.execute(simulated, { type: 'setOnOff', on: true, outletId: '00' });
    assert.equal(net.tcpCalls.length, 0);
    assert.equal(updated.currentState.outlets?.['00'].on, true);
    assert.equal(updated.hardwareVerified, false);

    const failing = new DeviceAdapterRegistry();
    failing.register(new RejectingAdapter());
    const commands = new DeviceCommandService(failing);
    const real = device({ adapterId: 'reject', currentState: { on: false } });
    await assert.rejects(() => commands.execute(real, { type: 'setOnOff', on: true }), /refusée/);
    assert.equal(real.currentState.on, false);
    await assert.rejects(() => commands.execute(real, { type: 'setBrightness', brightness: 10 }), /Intensité/);
  });

  it('reconnecte trois fois puis marque hors ligne', async () => {
    const registry = new DeviceAdapterRegistry();
    const adapter = new RejectingAdapter();
    registry.register(adapter);
    const delays: number[] = [];
    const manager = new DeviceConnectionManager(registry, async (ms) => {
      delays.push(ms);
    });
    const result = await manager.reconnect(device({ adapterId: 'reject' }));
    assert.equal(adapter.calls, 3);
    assert.deepEqual(delays, [1000, 2000]);
    assert.equal(result.connectionStatus, 'offline');
    assert.equal(result.currentState.on, false);
  });

  it('ne traite pas le cache Zigbee2MQTT comme un échange réseau', async () => {
    const cached = device({
      protocol: 'zigbee2mqtt',
      adapterId: 'zigbee',
      hardwareVerified: false,
      protocolData: { gatewayId: 'gw', friendlyName: 'salon', baseTopic: 'zigbee2mqtt' },
      currentState: { currentTemperatureC: 20 },
    });
    const connected = await connectThroughGateway(cached, {
      async publish() {},
      async callService() {},
      async readHomeAssistantState() {
        return null;
      },
    });
    assert.equal(connected.connectionStatus, 'connected');
    assert.equal(connected.hardwareVerified, false);
    assert.equal(connected.currentState.currentTemperatureC, 20);

    const missing = await connectThroughGateway(device({
      protocol: 'home-assistant',
      adapterId: 'stelpro',
      protocolData: { gatewayId: 'ha', entityIds: ['climate.maestro'] },
    }), {
      async publish() {},
      async callService() {},
      async readHomeAssistantState() {
        return { entity_id: 'climate.maestro', state: 'unavailable', attributes: {} };
      },
    });
    assert.equal(missing.connectionStatus, 'offline');
    assert.equal(missing.hardwareVerified, false);
  });
});

describe('filtres, groupes et persistance', () => {
  it('combine les filtres et autorise plusieurs groupes', () => {
    const salon = device({ id: 'a', name: 'Lampe salon', manufacturer: 'Belkin', roomId: 'salon', groupIds: ['g1', 'g2'], isFavorite: true, currentState: { on: false } });
    const prise = device({ id: 'b', name: 'Prise', manufacturer: 'TP-Link', roomId: 'cuisine', groupIds: ['g1'], currentState: { on: true } });
    const visible = filterDevices([salon, prise], {
      query: 'lampe',
      types: [],
      manufacturers: ['Belkin'],
      roomIds: ['salon'],
      groupIds: ['g2'],
      connection: 'connected',
      power: 'off',
      favoritesOnly: true,
    }, { salon: 'Salon' });
    assert.deepEqual(visible.map((item) => item.id), ['a']);
    const registry = new DeviceRegistry();
    registry.save(salon);
    registry.save(prise);
    assert.deepEqual(devicesInGroup(registry.list(), 'g1').map((item) => item.id).sort(), ['a', 'b']);
    registry.clearGroup('g2');
    assert.equal(registry.get('a')?.groupIds.includes('g2'), false);
    assert.equal(registry.get('a')?.roomId, 'salon');
  });

  it('persiste appareils, pièces, groupes, favoris et passerelle sans secret', async () => {
    const repository = new HomeRepository(nodeSql());
    await repository.migrate();
    await repository.saveRoom({ id: 'salon', name: 'Salon', icon: 'home', sortOrder: 0 });
    await repository.saveGroup({ id: 'g1', name: 'Soir', deviceIds: [], sortOrder: 1 });
    await repository.saveDevice(device({ id: 'prise', roomId: 'salon', groupIds: ['g1'], isFavorite: true, nameLocked: true }));
    await repository.saveGateway({
      id: 'gw',
      name: 'Zigbee',
      type: 'zigbee2mqtt',
      address: '192.168.1.8',
      port: 8883,
      tls: true,
      baseTopic: 'zigbee2mqtt',
      username: 'maison',
      secretRef: 'gateway.gw.secret',
      connectionStatus: 'detected',
      capabilities: ['mqtt'],
    });
    await repository.setPreference('demoMode', false);
    const loaded = await repository.load();
    assert.equal(loaded.devices[0].isFavorite, true);
    assert.equal(loaded.devices[0].roomId, 'salon');
    assert.deepEqual(loaded.devices[0].groupIds, ['g1']);
    assert.equal(loaded.groups[0].deviceIds[0], 'prise');
    assert.equal(loaded.gateways[0].tls, true);
    assert.equal(JSON.stringify(loaded.gateways[0]).includes('mot de passe'), false);
    assert.equal(loaded.preferences.demoMode, false);
    await repository.deleteRoom('salon');
    const after = await repository.load();
    assert.equal(after.devices[0].roomId, undefined);
  });

  it('applique une consigne simulée sans transport', () => {
    const thermostat = device({
      type: 'thermostat',
      capabilities: [{ id: 'thermostat', kind: 'thermostat', writable: true, min: 5, max: 30, step: 0.5, modes: ['off', 'heat'] }],
      currentState: { currentTemperatureC: 18, targetTemperatureC: 19, mode: 'heat' },
    });
    const state = applySimulatedCommand(thermostat, { type: 'setTargetTemperature', celsius: 21 });
    assert.equal(state.targetTemperatureC, 21);
    assert.equal(state.heating, true);
  });
});

class RejectingAdapter implements DeviceAdapter {
  id = 'reject';
  manufacturer = 'Test';
  calls = 0;

  async discover(): Promise<DiscoveryHit[]> {
    return [];
  }

  async identify(): Promise<DiscoveryHit | null> {
    return null;
  }

  async authenticate(device: Device): Promise<Device> {
    return device;
  }

  async connect(): Promise<Device> {
    this.calls += 1;
    throw new DeviceError('temps dépassé', 'timeout');
  }

  getCapabilities(device: Device) {
    return device.capabilities;
  }

  async getState(): Promise<DeviceState> {
    throw new DeviceError('hors ligne', 'offline');
  }

  async executeCommand(): Promise<DeviceState> {
    throw new DeviceError('commande refusée', 'rejected');
  }

  async disconnect(): Promise<void> {
    return;
  }
}

void Command;
