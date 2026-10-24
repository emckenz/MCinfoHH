import { DeviceError, errorMessage } from '../domain/errors';
import { ConnectionStatus, DiscoveryHit, Gateway, Json } from '../domain/types';
import { haDeviceHit, HaDevice, HaEntity, HaRegistryEntity } from '../protocol/homeAssistant';
import { MqttSession } from '../protocol/mqttSession';
import { decodeUtf8 } from '../protocol/bytes';
import { z2mHit, z2mState, Z2mDevice } from '../protocol/z2m';
import { NetworkTransport } from '../transport/types';
import { GatewayAccess } from './gatewayAccess';
import { HaSocket, HomeAssistantClient } from './HomeAssistantClient';

export interface GatewayUpdate {
  gatewayId: string;
  key: string;
  state: ReturnType<typeof z2mState>;
  verified: boolean;
}

export class ZigbeeGatewayService implements GatewayAccess {
  private mqtt = new Map<string, { session: MqttSession; baseTopic: string }>();
  private ha = new Map<string, HomeAssistantClient>();
  private status = new Map<string, ConnectionStatus>();
  private bridges = new Map<string, Z2mDevice[]>();
  private bridgeWaiters = new Map<string, Array<() => void>>();
  onUpdate: ((update: GatewayUpdate) => void) | null = null;
  onStatus: ((gatewayId: string, status: ConnectionStatus, error?: string) => void) | null = null;

  constructor(
    private readonly transport: NetworkTransport,
    private readonly sockets: (url: string) => HaSocket = (url) => new WebSocket(url) as unknown as HaSocket,
  ) {}

  async connect(gateway: Gateway, secret: string): Promise<void> {
    if (gateway.type === 'zigbee2mqtt') {
      const session = new MqttSession(await this.transport.openSocket(gateway.address, gateway.port, gateway.tls, 8000));
      await session.connect({
        clientId: `maison-${gateway.id.slice(0, 8)}`,
        username: gateway.username,
        password: secret || undefined,
        keepAliveSeconds: 30,
      });
      await session.subscribe(`${gateway.baseTopic}/#`);
      this.mqtt.set(gateway.id, { session, baseTopic: gateway.baseTopic });
      this.status.set(gateway.id, 'connected');
      void this.listen(gateway.id, session, gateway.baseTopic);
      return;
    }
    const protocol = gateway.tls ? 'wss' : 'ws';
    const client = new HomeAssistantClient(this.sockets);
    await client.connect(`${protocol}://${gateway.address}:${gateway.port}/api/websocket`, secret);
    this.ha.set(gateway.id, client);
    this.status.set(gateway.id, 'connected');
  }

  connectionStatus(gatewayId: string): ConnectionStatus {
    return this.status.get(gatewayId) ?? 'offline';
  }

  async importDevices(gateway: Gateway): Promise<DiscoveryHit[]> {
    if (gateway.type === 'zigbee2mqtt') return this.importZigbee2Mqtt(gateway);
    return this.importHomeAssistant(gateway);
  }

  async permitJoin(gateway: Gateway, seconds = 60): Promise<void> {
    if (gateway.type !== 'zigbee2mqtt') {
      throw new DeviceError('L’appairage Zigbee se demande à Zigbee2MQTT. Home Assistant se pilote depuis son propre écran.', 'unsupported');
    }
    await this.publish(gateway.id, `${gateway.baseTopic}/bridge/request/permit_join`, JSON.stringify({ time: seconds }));
  }

  async publish(gatewayId: string, topic: string, payload: string): Promise<void> {
    const mqtt = this.mqtt.get(gatewayId);
    if (!mqtt) throw new DeviceError('Zigbee2MQTT n’est pas connecté.', 'offline');
    await mqtt.session.publish(topic, payload);
  }

  async callService(gatewayId: string, domain: string, service: string, data: Json): Promise<void> {
    const client = this.ha.get(gatewayId);
    if (!client) throw new DeviceError('Home Assistant n’est pas connecté.', 'offline');
    await client.request('call_service', { domain, service, service_data: data });
  }

  async readHomeAssistantState(gatewayId: string, entityId: string): Promise<HaEntity | null> {
    const client = this.ha.get(gatewayId);
    if (!client) return null;
    const cached = client.state(entityId);
    if (cached) return cached;
    const states = (await client.request('get_states')) as HaEntity[];
    client.rememberStates(states);
    return client.state(entityId);
  }

  async listUsb(): Promise<Json[]> {
    const devices = await this.transport.listUsbDevices();
    return devices as unknown as Json[];
  }

  disconnect(gatewayId: string): void {
    this.mqtt.get(gatewayId)?.session.close().catch(() => undefined);
    this.mqtt.delete(gatewayId);
    this.ha.get(gatewayId)?.close();
    this.ha.delete(gatewayId);
    this.status.set(gatewayId, 'offline');
  }

  private async importZigbee2Mqtt(gateway: Gateway): Promise<DiscoveryHit[]> {
    if (!this.mqtt.has(gateway.id)) throw new DeviceError('Connectez Zigbee2MQTT avant l’import.', 'offline');
    const devices = this.bridges.get(gateway.id) ?? (await this.waitForBridge(gateway.id));
    return devices.flatMap((device) => {
      const hit = z2mHit(device, gateway.id);
      if (!hit) return [];
      hit.protocolData.baseTopic = gateway.baseTopic;
      return [hit];
    });
  }

  private waitForBridge(gatewayId: string): Promise<Z2mDevice[]> {
    const existing = this.bridges.get(gatewayId);
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new DeviceError('Zigbee2MQTT n’a pas publié bridge/devices. Vérifiez le sujet de base.', 'timeout'));
      }, 5000);
      const waiters = this.bridgeWaiters.get(gatewayId) ?? [];
      waiters.push(() => {
        clearTimeout(timer);
        resolve(this.bridges.get(gatewayId) ?? []);
      });
      this.bridgeWaiters.set(gatewayId, waiters);
    });
  }

  private async importHomeAssistant(gateway: Gateway): Promise<DiscoveryHit[]> {
    const client = this.ha.get(gateway.id);
    if (!client) throw new DeviceError('Connectez Home Assistant avant l’import.', 'offline');
    const devices = (await client.request('config/device_registry/list')) as HaDevice[];
    const entities = (await client.request('config/entity_registry/list')) as HaRegistryEntity[];
    const states = (await client.request('get_states')) as HaEntity[];
    client.rememberStates(states);
    return devices.flatMap((device) => {
      const hit = haDeviceHit(device, entities, states, gateway.id);
      return hit ? [hit] : [];
    });
  }

  private async listen(gatewayId: string, session: MqttSession, baseTopic: string): Promise<void> {
    while (this.mqtt.get(gatewayId)?.session === session) {
      try {
        const packet = await session.next(60000);
        if (packet.type !== 'publish' || packet.topic.endsWith('/set') || packet.topic.endsWith('/get')) continue;
        const prefix = `${baseTopic}/`;
        if (packet.topic === `${baseTopic}/bridge/devices`) {
          const devices = JSON.parse(decodeUtf8(packet.payload)) as Z2mDevice[];
          this.bridges.set(gatewayId, devices);
          const waiters = this.bridgeWaiters.get(gatewayId) ?? [];
          this.bridgeWaiters.set(gatewayId, []);
          waiters.forEach((waiter) => waiter());
          continue;
        }
        if (!packet.topic.startsWith(prefix) || packet.topic.startsWith(`${prefix}bridge/`)) continue;
        const key = packet.topic.slice(prefix.length);
        const payload = JSON.parse(decodeUtf8(packet.payload)) as Record<string, unknown>;
        this.onUpdate?.({ gatewayId, key, state: z2mState(payload, 255), verified: true });
      } catch (error) {
        if (error instanceof DeviceError && error.code === 'timeout') {
          await session.ping().catch(() => this.fail(gatewayId, errorMessage(error)));
          continue;
        }
        this.fail(gatewayId, errorMessage(error));
        return;
      }
    }
  }

  private fail(gatewayId: string, message: string): void {
    this.status.set(gatewayId, 'offline');
    this.onStatus?.(gatewayId, 'offline', message);
    this.mqtt.get(gatewayId)?.session.close().catch(() => undefined);
    this.mqtt.delete(gatewayId);
  }
}
