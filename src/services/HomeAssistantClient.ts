import { DeviceError } from '../domain/errors';
import { Json } from '../domain/types';
import { HaEntity } from '../protocol/homeAssistant';

export interface HaSocket {
  send(data: string): void;
  close(): void;
  onopen: (() => void) | null;
  onmessage: ((event: { data: string }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onclose: (() => void) | null;
}

export class HomeAssistantClient {
  private socket: HaSocket | null = null;
  private pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  private nextId = 1;
  private states = new Map<string, HaEntity>();

  constructor(private readonly factory: (url: string) => HaSocket) {}

  async connect(url: string, token: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const socket = this.factory(url);
      this.socket = socket;
      const timer = setTimeout(() => reject(new DeviceError('Délai de connexion à Home Assistant.', 'timeout')), 8000);
      socket.onopen = () => undefined;
      socket.onerror = () => {
        clearTimeout(timer);
        reject(new DeviceError('Connexion Home Assistant impossible.', 'offline'));
      };
      socket.onclose = () => {
        this.rejectAll(new DeviceError('Connexion Home Assistant fermée.', 'offline'));
      };
      socket.onmessage = (event) => {
        const message = JSON.parse(String(event.data)) as { type?: string; id?: number; success?: boolean; result?: unknown; message?: string };
        if (message.type === 'auth_required') {
          socket.send(JSON.stringify({ type: 'auth', access_token: token }));
          return;
        }
        if (message.type === 'auth_ok') {
          clearTimeout(timer);
          resolve();
          return;
        }
        if (message.type === 'auth_invalid') {
          clearTimeout(timer);
          reject(new DeviceError('Jeton Home Assistant refusé.', 'auth'));
          return;
        }
        if (message.type === 'result' && message.id) {
          const waiter = this.pending.get(message.id);
          if (!waiter) return;
          this.pending.delete(message.id);
          if (message.success === false) waiter.reject(new DeviceError(message.message || 'Commande Home Assistant refusée.', 'rejected'));
          else waiter.resolve(message.result);
        }
      };
    });
  }

  async request(type: string, extra: Record<string, Json> = {}): Promise<unknown> {
    const socket = this.socket;
    if (!socket) throw new DeviceError('Home Assistant n’est pas connecté.', 'offline');
    const id = this.nextId;
    this.nextId += 1;
    const result = new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
    socket.send(JSON.stringify({ id, type, ...extra }));
    return result;
  }

  rememberStates(states: HaEntity[]): void {
    this.states = new Map(states.map((state) => [state.entity_id, state]));
  }

  state(entityId: string): HaEntity | null {
    return this.states.get(entityId) ?? null;
  }

  close(): void {
    this.socket?.close();
    this.socket = null;
  }

  private rejectAll(error: Error): void {
    for (const waiter of this.pending.values()) waiter.reject(error);
    this.pending.clear();
  }
}
