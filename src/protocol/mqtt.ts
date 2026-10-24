import { concat, decodeUtf8, utf8 } from './bytes';

export interface MqttConnectOptions {
  clientId: string;
  username?: string;
  password?: string;
  keepAliveSeconds: number;
}

export type MqttPacket =
  | { type: 'connack'; returnCode: number }
  | { type: 'publish'; topic: string; payload: Uint8Array }
  | { type: 'suback' }
  | { type: 'pingresp' }
  | { type: 'other'; packetType: number };

export function encodeConnect(options: MqttConnectOptions): Uint8Array {
  let flags = 0x02;
  const payload = [encodeMqttString(options.clientId)];
  if (options.username) {
    flags |= 0x80;
    payload.push(encodeMqttString(options.username));
  }
  if (options.password) {
    flags |= 0x40;
    payload.push(encodeMqttString(options.password));
  }
  const variable = concat([
    encodeMqttString('MQTT'),
    Uint8Array.of(0x04, flags, options.keepAliveSeconds >> 8, options.keepAliveSeconds & 0xff),
    ...payload,
  ]);
  return packet(0x10, variable);
}

export function encodePublish(topic: string, payload: string): Uint8Array {
  return packet(0x30, concat([encodeMqttString(topic), utf8(payload)]));
}

export function encodeSubscribe(packetId: number, topic: string): Uint8Array {
  return packet(0x82, concat([u16(packetId), encodeMqttString(topic), Uint8Array.of(0)]));
}

export function encodePingreq(): Uint8Array {
  return Uint8Array.of(0xc0, 0x00);
}

export function encodeDisconnect(): Uint8Array {
  return Uint8Array.of(0xe0, 0x00);
}

export function decodePackets(input: Uint8Array): { packets: MqttPacket[]; rest: Uint8Array } {
  const packets: MqttPacket[] = [];
  let offset = 0;
  while (offset < input.length) {
    const header = input[offset];
    const length = decodeRemainingLength(input, offset + 1);
    if (!length) break;
    const start = length.offset;
    const end = start + length.value;
    if (end > input.length) break;
    packets.push(decodeOne(header, input.slice(start, end)));
    offset = end;
  }
  return { packets, rest: input.slice(offset) };
}

function decodeOne(header: number, body: Uint8Array): MqttPacket {
  const packetType = header >> 4;
  if (packetType === 2 && body.length >= 2) return { type: 'connack', returnCode: body[1] };
  if (packetType === 3) {
    const topicLength = (body[0] << 8) | body[1];
    const topic = decodeUtf8(body.slice(2, 2 + topicLength));
    return { type: 'publish', topic, payload: body.slice(2 + topicLength) };
  }
  if (packetType === 9) return { type: 'suback' };
  if (packetType === 13) return { type: 'pingresp' };
  return { type: 'other', packetType };
}

function packet(header: number, body: Uint8Array): Uint8Array {
  return concat([Uint8Array.of(header), Uint8Array.from(encodeRemainingLength(body.length)), body]);
}

export function encodeRemainingLength(length: number): number[] {
  const out: number[] = [];
  let value = length;
  do {
    let encoded = value % 128;
    value = Math.floor(value / 128);
    if (value > 0) encoded |= 0x80;
    out.push(encoded);
  } while (value > 0 && out.length < 4);
  return out;
}

function decodeRemainingLength(bytes: Uint8Array, offset: number): { value: number; offset: number } | null {
  let multiplier = 1;
  let value = 0;
  let index = offset;
  for (let count = 0; count < 4; count += 1) {
    if (index >= bytes.length) return null;
    const encoded = bytes[index];
    index += 1;
    value += (encoded & 127) * multiplier;
    if ((encoded & 128) === 0) return { value, offset: index };
    multiplier *= 128;
  }
  return null;
}

function encodeMqttString(value: string): Uint8Array {
  const bytes = utf8(value);
  return concat([u16(bytes.length), bytes]);
}

function u16(value: number): Uint8Array {
  return Uint8Array.of((value >> 8) & 0xff, value & 0xff);
}

export const MQTT_CONNACK: Record<number, string> = {
  0: 'Connexion acceptée',
  1: 'Protocole refusé',
  2: 'Identifiant refusé',
  3: 'Serveur indisponible',
  4: 'Identifiant ou mot de passe refusé',
  5: 'Connexion non autorisée',
};
