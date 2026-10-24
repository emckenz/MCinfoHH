import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { assertLanHost } from '../src/domain/localAddress';
import { subnetFromPrefix } from '../src/domain/subnet';
import { DeviceError } from '../src/domain/errors';
import { base64ToBytes, bytesToBase64 } from '../src/protocol/bytes';
import {
  encryptKasa,
  frameKasaTcp,
  kasaChildCommandId,
  kasaSetRelayState,
  parseKasaSysInfo,
  unframeKasaTcp,
} from '../src/protocol/kasa';
import { encodeConnect, encodePublish, encodeSubscribe } from '../src/protocol/mqtt';
import { identifyLevitonModel } from '../src/protocol/leviton';
import { matterHit } from '../src/protocol/matter';
import { identifyStelproModel } from '../src/protocol/stelpro';
import { haCommand, haServiceMessage } from '../src/protocol/homeAssistant';
import { z2mCapabilities, z2mCommandPayload, z2mHit } from '../src/protocol/z2m';
import { parseBinaryState, parseScpdActions, parseSetupXml, soapEnvelope, wemoCapabilities, wemoSearchPayload } from '../src/protocol/wemo';

const SYSINFO = '{"system":{"get_sysinfo":{}}}';

describe('Kasa', () => {
  it('reproduit le vecteur de chiffrement historique', () => {
    assert.equal(Buffer.from(encryptKasa(SYSINFO)).toString('hex'), 'd0f281f88bff9af7d5ef94b6d1b4c09fec95e68fe187e8caf08bf68bf6');
    assert.equal(Buffer.from(frameKasaTcp(SYSINFO)).toString('hex'), '0000001dd0f281f88bff9af7d5ef94b6d1b4c09fec95e68fe187e8caf08bf68bf6');
    assert.equal(unframeKasaTcp(frameKasaTcp(SYSINFO)), SYSINFO);
  });

  it('commande une seule sortie KP400 avec deviceId et index', () => {
    const info = parseKasaSysInfo(JSON.stringify({
      system: { get_sysinfo: { model: 'KP400(US)', deviceId: 'ABC', alias: 'Prise', children: [{ id: '00', state: 1, alias: 'A' }, { id: '01', state: 0 }] } },
    }));
    assert.equal(info.children.length, 2);
    assert.equal(kasaChildCommandId(info.deviceId, '00'), 'ABC00');
    assert.deepEqual(kasaSetRelayState(1, ['ABC00']), {
      context: { child_ids: ['ABC00'] },
      system: { set_relay_state: { state: 1 } },
    });
  });
});

describe('WeMo', () => {
  it('construit une recherche SSDP ciblée', () => {
    const payload = wemoSearchPayload('urn:Belkin:device:controllee:1');
    assert.match(payload, /M-SEARCH \* HTTP\/1.1\r\n/);
    assert.match(payload, /ST: urn:Belkin:device:controllee:1\r\n/);
    assert.doesNotMatch(payload, /brightness/);
  });

  it('ne met pas brightness si le SCPD ne l’annonce pas', () => {
    const setup = `<?xml version="1.0"?><root><device><friendlyName>Cuisine</friendlyName><manufacturer>Belkin International Inc.</manufacturer><modelName>LightSwitch</modelName><modelNumber>1.0</modelNumber><UDN>uuid:Lightswitch-1</UDN><deviceType>urn:Belkin:device:lightswitch:1</deviceType><macAddress>AA:BB:CC:DD:EE:01</macAddress><serviceList><service><serviceType>urn:Belkin:service:basicevent:1</serviceType><controlURL>/upnp/control/basicevent1</controlURL><SCPDURL>/eventservice.xml</SCPDURL></service></serviceList></device></root>`;
    const scpd = `<scpd><actionList><action><name>SetBinaryState</name><argumentList><argument><name>BinaryState</name></argument></argumentList></action></actionList></scpd>`;
    const description = parseSetupXml(setup);
    const capabilities = wemoCapabilities(description, parseScpdActions(scpd));
    assert.deepEqual(capabilities.map((capability) => capability.kind), ['onOff']);
    const envelope = soapEnvelope('SetBinaryState', 'urn:Belkin:service:basicevent:1', { BinaryState: 1 });
    assert.match(envelope, /<BinaryState>1<\/BinaryState>/);
    assert.doesNotMatch(envelope, /brightness/);
  });

  it('ajoute brightness seulement quand l’argument est déclaré', () => {
    const scpd = `<action><name>SetBinaryState</name><argument><name>BinaryState</name></argument><argument><name>brightness</name></argument></action>`;
    const actions = parseScpdActions(`<scpd>${scpd}</scpd>`);
    assert.ok(actions[0].arguments.includes('brightness'));
    const dimmer = `<?xml version="1.0"?><root><device><friendlyName>Salon</friendlyName><manufacturer>Belkin</manufacturer><modelName>Dimmer</modelName><deviceType>urn:Belkin:device:dimmer:1</deviceType><UDN>uuid:Dimmer-1</UDN><serviceList><service><serviceType>urn:Belkin:service:basicevent:1</serviceType><controlURL>/upnp/control/basicevent1</controlURL><SCPDURL>/eventservice.xml</SCPDURL></service></serviceList></device></root>`;
    const capabilities = wemoCapabilities(parseSetupXml(dimmer), actions);
    assert.ok(capabilities.some((capability) => capability.kind === 'brightness'));
    const state = parseBinaryState('<BinaryState>8</BinaryState><brightness>40</brightness>');
    assert.equal(state.on, true);
    assert.equal(state.standby, true);
    assert.equal(state.brightness, 40);
  });
});

describe('identification', () => {
  it('ne traite pas un Leviton comme un appareil local unique', () => {
    assert.equal(identifyLevitonModel('DW6HD').localControl, 'cloud-not-implemented');
    assert.equal(identifyLevitonModel('DZ15S').radio, 'Z-Wave');
    assert.equal(identifyLevitonModel('DG6HD').radio, 'Zigbee');
    assert.equal(identifyLevitonModel('D26HD').localControl, 'matter-not-implemented');
    assert.equal(identifyLevitonModel('interrupteur blanc').localControl, 'unknown');
  });

  it('ne suppose pas de Wi-Fi sur le convecteur Orléans', () => {
    const orleans = identifyStelproModel('SOR');
    assert.match(orleans.note, /Wi-Fi direct/);
    assert.equal(orleans.status, 'detected');
    assert.equal(identifyStelproModel('SORB').radio, 'Zigbee');
    assert.equal(identifyStelproModel('STZW402+').radio, 'Z-Wave');
    assert.match(identifyStelproModel('blanc').note, /pas forcément un Maestro/);
  });

  it('détecte Matter sans le rendre commandable', () => {
    const hit = matterHit({ name: 'Ampoule', type: '_matterc._udp.', host: '192.168.1.40', txt: { DN: 'Leviton salon', VP: '1234+56', D: '3840' } });
    assert.equal(hit.connectionStatus, 'authentication_required');
    assert.equal(hit.capabilities.length, 0);
    assert.equal(hit.manufacturer, 'Leviton');
    assert.match(hit.compatibilityNote, /n’envoie aucune commande|n'envoie aucune commande|Aucune commande|ne le commissionne/);
  });

  it('reste sur le réseau local', () => {
    assert.doesNotThrow(() => assertLanHost('192.168.1.20'));
    assert.doesNotThrow(() => assertLanHost('homeassistant.local'));
    assert.throws(() => assertLanHost('8.8.8.8'), DeviceError);
    assert.throws(() => assertLanHost('my.leviton.com'), DeviceError);
    assert.deepEqual(subnetFromPrefix('192.168.1.23', 24), { network: '192.168.1.0', broadcast: '192.168.1.255' });
  });
});

describe('passerelles', () => {
  it('encode MQTT 3.1.1 sans inventer de sujet', () => {
    assert.deepEqual(Array.from(encodeConnect({ clientId: 'a', keepAliveSeconds: 10 })), [0x10, 0x0d, 0x00, 0x04, 0x4d, 0x51, 0x54, 0x54, 0x04, 0x02, 0x00, 0x0a, 0x00, 0x01, 0x61]);
    assert.deepEqual(Array.from(encodePublish('t', 'hi')), [0x30, 0x05, 0x00, 0x01, 0x74, 0x68, 0x69]);
    assert.equal(encodeSubscribe(1, 'zigbee2mqtt/#' )[0], 0x82);
  });

  it('mappe les exposes Stelpro et refuse une consigne hors plage', () => {
    const hit = z2mHit({
      ieee_address: '0x001',
      friendly_name: 'orleans',
      supported: true,
      definition: {
        model: 'SORB',
        vendor: 'Stelpro',
        description: 'ORLÉANS fan heater',
        exposes: [{ type: 'climate', features: [
          { name: 'occupied_heating_setpoint', value_min: 5, value_max: 30, value_step: 0.5, access: 0b111 },
          { name: 'system_mode', values: ['off', 'auto', 'heat'], access: 0b111 },
          { name: 'local_temperature', access: 0b001 },
        ] }],
      },
    }, 'gw');
    assert.equal(hit?.adapterId, 'stelpro');
    assert.equal(hit?.type, 'convector');
    const thermostat = z2mCapabilities(hit?.protocolData ? [] : []);
    void thermostat;
    assert.throws(() => z2mCommandPayload({ type: 'setTargetTemperature', celsius: 40 }, hit?.capabilities[0], 255), /plage/);
    assert.deepEqual(z2mCommandPayload({ type: 'setTargetTemperature', celsius: 21 }, hit?.capabilities[0], 255), { occupied_heating_setpoint: 21 });
  });

  it('construit un appel Home Assistant documenté', () => {
    const command = haCommand('climate.maestro', { type: 'setTargetTemperature', celsius: 21 });
    assert.deepEqual(haServiceMessage(4, command.domain, command.service, command.data), {
      id: 4,
      type: 'call_service',
      domain: 'climate',
      service: 'set_temperature',
      service_data: { entity_id: 'climate.maestro', temperature: 21 },
    });
    assert.equal(bytesToBase64(base64ToBytes('YQ==')), 'YQ==');
  });
});
