import { DeviceError } from '../domain/errors';
import { SocketHandle } from '../transport/types';
import { concat, decodeUtf8 } from './bytes';
import {
  decodePackets,
  encodeConnect,
  encodeDisconnect,
  encodePingreq,
  encodePublish,
  encodeSubscribe,
  MqttConnectOptions,
  MqttPacket,
  MQTT_CONNACK,
} from './mqtt';

export class MqttSession {
  private buffer: Uint8Array<ArrayBufferLike> = new Uint8Array();
  private queue: MqttPacket[] = [];
  private reading = false;

  constructor(private readonly socket: SocketHandle) {}

  async connect(options: MqttConnectOptions): Promise<void> {
    await this.socket.write(encodeConnect(options));
    const packet = await this.next(8000);
    if (packet.type !== 'connack') throw new DeviceError('Réponse MQTT inattendue.', 'protocol');
    if (packet.returnCode !== 0) {
      const code = packet.returnCode === 4 || packet.returnCode === 5 ? 'auth' : 'rejected';
      throw new DeviceError(MQTT_CONNACK[packet.returnCode] ?? 'Connexion MQTT refusée.', code);
    }
  }

  async subscribe(topic: string): Promise<void> {
    await this.socket.write(encodeSubscribe(1, topic));
  }

  async publish(topic: string, payload: string): Promise<void> {
    await this.socket.write(encodePublish(topic, payload));
  }

  async ping(): Promise<void> {
    await this.socket.write(encodePingreq());
  }

  async next(timeoutMs: number): Promise<MqttPacket> {
    const queued = this.queue.shift();
    if (queued) return queued;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const chunk = await this.socket.read(Math.min(1000, deadline - Date.now()), 16384);
      if (chunk.length === 0) continue;
      this.buffer = concat([this.buffer, chunk]);
      const decoded = decodePackets(this.buffer);
      this.buffer = decoded.rest;
      if (decoded.packets.length > 0) {
        const [first, ...rest] = decoded.packets;
        this.queue.push(...rest);
        return first;
      }
    }
    throw new DeviceError('Délai MQTT dépassé.', 'timeout');
  }

  async close(): Promise<void> {
    try {
      await this.socket.write(encodeDisconnect());
    } catch {
      // La fermeture locale suffit si le courtier a déjà coupé.
    }
    await this.socket.close();
  }

  payloadText(packet: MqttPacket): string {
    if (packet.type !== 'publish') return '';
    return decodeUtf8(packet.payload);
  }
}
