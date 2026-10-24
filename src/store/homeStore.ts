import { create } from 'zustand';
import { Platform } from 'react-native';

import { HomeRepository } from '../data/repository';
import { createSecretStore, gatewaySecretKey, SecretStore } from '../data/secrets';
import { openExpoDatabase } from '../data/expoDatabase';
import { SIMULATED_DEVICES, SIMULATED_GROUPS, SIMULATED_ROOMS } from '../demo/fixtures';
import { DeviceError, errorMessage } from '../domain/errors';
import { assertLanHost } from '../domain/localAddress';
import { Command, Device, DiscoveryHit, Gateway, Group, Room } from '../domain/types';
import { withMembership } from '../services/DeviceRegistry';
import { DeviceRegistry } from '../services/DeviceRegistry';
import { createHomeServices, HomeServices } from '../services/createHomeServices';
import { DiscoveryScope } from '../services/DeviceDiscoveryService';
import { getTransport } from '../transport/runtime';

export type ThemeChoice = 'system' | 'light' | 'dark';

interface HomeState {
  ready: boolean;
  bootError?: string;
  actionError?: string;
  devices: Device[];
  rooms: Room[];
  groups: Group[];
  gateways: Gateway[];
  theme: ThemeChoice;
  demoMode: boolean;
  selectedDeviceId?: string;
  secretsPersistent: boolean;
  discovery: DiscoveryHit[];
  discovering: boolean;
  discoveryError?: string;
  usbDevices: Array<Record<string, unknown>>;
  bootstrap: () => Promise<void>;
  setTheme: (theme: ThemeChoice) => Promise<void>;
  setDemoMode: (enabled: boolean) => Promise<void>;
  selectDevice: (id?: string) => void;
  addHit: (hit: DiscoveryHit) => Promise<void>;
  execute: (deviceId: string, command: Command) => Promise<void>;
  executeMany: (deviceIds: string[], command: Command) => Promise<Array<{ id: string; ok: boolean; error?: string }>>;
  refreshDevice: (deviceId: string) => Promise<void>;
  renameDevice: (deviceId: string, name: string) => Promise<void>;
  toggleFavorite: (deviceId: string) => Promise<void>;
  assignRoom: (deviceId: string, roomId?: string) => Promise<void>;
  toggleGroup: (deviceId: string, groupId: string) => Promise<void>;
  removeDevice: (deviceId: string) => Promise<void>;
  saveRoom: (room: Room) => Promise<void>;
  deleteRoom: (roomId: string) => Promise<void>;
  saveGroup: (group: Group) => Promise<void>;
  deleteGroup: (groupId: string) => Promise<void>;
  reorder: (ids: string[]) => Promise<void>;
  discover: (scope: DiscoveryScope, options?: { gatewayId?: string; ipAddress?: string; model?: string }) => Promise<void>;
  saveGateway: (input: { id?: string; name: string; type: Gateway['type']; address: string; port: number; tls: boolean; baseTopic: string; username?: string; secret?: string }) => Promise<void>;
  connectGateway: (gatewayId: string) => Promise<void>;
  importGateway: (gatewayId: string) => Promise<void>;
  permitJoin: (gatewayId: string) => Promise<void>;
  deleteGateway: (gatewayId: string) => Promise<void>;
  inspectUsb: () => Promise<void>;
}

let booting = false;
let repository: HomeRepository | null = null;
let services: HomeServices | null = null;
let secrets: SecretStore | null = null;
const registry = new DeviceRegistry();
let rooms: Room[] = [];
let groups: Group[] = [];
let gateways: Gateway[] = [];

function publish(set: (partial: Partial<HomeState>) => void, extra: Partial<HomeState> = {}): void {
  const devices = registry.list();
  set({ devices, rooms, groups: withMembership(groups, devices), gateways, ...extra });
}

async function persistDevice(device: Device): Promise<void> {
  registry.save(device);
  await repository?.saveDevice(device);
}

export const useHomeStore = create<HomeState>((set, get) => ({
  ready: false,
  devices: [],
  rooms: [],
  groups: [],
  gateways: [],
  theme: 'system',
  demoMode: false,
  secretsPersistent: false,
  discovery: [],
  discovering: false,
  usbDevices: [],

  async bootstrap() {
    if (get().ready || repository || booting) return;
    booting = true;
    try {
      secrets = createSecretStore();
      repository = new HomeRepository(await openExpoDatabase());
      await repository.migrate();
      services = createHomeServices(getTransport());
      services.gateways.onUpdate = (update) => {
        const device = registry.list().find((item) => item.protocolData.friendlyName === update.key || item.protocolData.ieee === update.key);
        if (!device || !update.key) return;
        const next = {
          ...device,
          currentState: { ...device.currentState, ...update.state },
          connectionStatus: 'connected' as const,
          hardwareVerified: update.verified,
          lastSeen: Date.now(),
          lastError: undefined,
        };
        void persistDevice(next).then(() => publish(set));
      };
      services.states.start(() => registry.list(), (device) => {
        void persistDevice(device).then(() => publish(set));
      });
      const snapshot = await repository.load();
      rooms = snapshot.rooms;
      groups = snapshot.groups;
      gateways = snapshot.gateways;
      registry.replace(snapshot.devices);
      const theme = snapshot.preferences.theme === 'light' || snapshot.preferences.theme === 'dark' ? snapshot.preferences.theme : 'system';
      const demoMode = snapshot.preferences.demoMode === true;
      const selected = typeof snapshot.preferences.selectedDeviceId === 'string' ? snapshot.preferences.selectedDeviceId : undefined;
      publish(set, { ready: true, theme, demoMode, selectedDeviceId: selected, secretsPersistent: secrets.persistent });
    } catch (error) {
      set({ ready: true, bootError: errorMessage(error) });
    }
  },

  async setTheme(theme) {
    await repository?.setPreference('theme', theme);
    set({ theme });
  },

  async setDemoMode(enabled) {
    if (!repository) {
      set({ actionError: 'La base locale n’est pas ouverte. Rechargez l’application.' });
      return;
    }
    try {
      if (enabled) {
        for (const room of SIMULATED_ROOMS) await repository.saveRoom(room);
        for (const group of SIMULATED_GROUPS) await repository.saveGroup(group);
        for (const device of SIMULATED_DEVICES) await repository.saveDevice(device);
      } else {
        await repository.deleteSimulated();
      }
      await repository.setPreference('demoMode', enabled);
      const snapshot = await repository.load();
      rooms = snapshot.rooms;
      groups = snapshot.groups;
      registry.replace(snapshot.devices);
      publish(set, { demoMode: enabled, actionError: undefined });
    } catch (error) {
      set({ actionError: errorMessage(error) });
    }
  },

  selectDevice(id) {
    set({ selectedDeviceId: id });
    void repository?.setPreference('selectedDeviceId', id ?? null);
  },

  async addHit(hit) {
    const device = registry.upsertHit(hit);
    await repository?.saveDevice(device);
    publish(set);
    if (!services) return;
    const connected = await services.connections.reconnect(registry.get(device.id) ?? device);
    await persistDevice(connected);
    publish(set);
  },

  async execute(deviceId, command) {
    const device = registry.get(deviceId);
    if (!device || !services) throw new DeviceError('Appareil introuvable.', 'offline');
    try {
      const updated = await services.commands.execute(device, command);
      await persistDevice(updated);
      publish(set);
    } catch (error) {
      const code = error instanceof DeviceError ? error.code : 'rejected';
      const failed = {
        ...device,
        lastError: errorMessage(error),
        connectionStatus: code === 'timeout' || code === 'offline' ? 'offline' as const : device.connectionStatus,
      };
      await persistDevice(failed);
      publish(set);
      throw error;
    }
  },

  async executeMany(deviceIds, command) {
    const results = [];
    for (const id of deviceIds) {
      try {
        await get().execute(id, command);
        results.push({ id, ok: true });
      } catch (error) {
        results.push({ id, ok: false, error: errorMessage(error) });
      }
    }
    return results;
  },

  async refreshDevice(deviceId) {
    const device = registry.get(deviceId);
    if (!device || !services) return;
    const connected = await services.connections.reconnect(device);
    await persistDevice(connected);
    publish(set);
  },

  async renameDevice(deviceId, name) {
    const device = registry.get(deviceId);
    if (!device) return;
    await persistDevice({ ...device, name: name.trim() || device.name, nameLocked: true });
    publish(set);
  },

  async toggleFavorite(deviceId) {
    const device = registry.get(deviceId);
    if (!device) return;
    await persistDevice({ ...device, isFavorite: !device.isFavorite });
    publish(set);
  },

  async assignRoom(deviceId, roomId) {
    const device = registry.get(deviceId);
    if (!device) return;
    await persistDevice({ ...device, roomId });
    publish(set);
  },

  async toggleGroup(deviceId, groupId) {
    const device = registry.get(deviceId);
    if (!device) return;
    const groupIds = device.groupIds.includes(groupId) ? device.groupIds.filter((id) => id !== groupId) : [...device.groupIds, groupId];
    await persistDevice({ ...device, groupIds });
    publish(set);
  },

  async removeDevice(deviceId) {
    registry.remove(deviceId);
    await repository?.deleteDevice(deviceId);
    if (get().selectedDeviceId === deviceId) set({ selectedDeviceId: undefined });
    publish(set);
  },

  async saveRoom(room) {
    if (!repository) throw new DeviceError('La base locale n’est pas ouverte.', 'unavailable');
    await repository.saveRoom(room);
    rooms = rooms.some((item) => item.id === room.id) ? rooms.map((item) => (item.id === room.id ? room : item)) : [...rooms, room];
    publish(set);
  },

  async deleteRoom(roomId) {
    rooms = rooms.filter((room) => room.id !== roomId);
    registry.clearRoom(roomId);
    for (const device of registry.list()) await repository?.saveDevice(device);
    await repository?.deleteRoom(roomId);
    publish(set);
  },

  async saveGroup(group) {
    if (!repository) throw new DeviceError('La base locale n’est pas ouverte.', 'unavailable');
    await repository.saveGroup(group);
    groups = groups.some((item) => item.id === group.id) ? groups.map((item) => (item.id === group.id ? group : item)) : [...groups, group];
    publish(set);
  },

  async deleteGroup(groupId) {
    groups = groups.filter((group) => group.id !== groupId);
    registry.clearGroup(groupId);
    for (const device of registry.list()) await repository?.saveDevice(device);
    await repository?.deleteGroup(groupId);
    publish(set);
  },

  async reorder(ids) {
    ids.forEach((id, index) => {
      const device = registry.get(id);
      if (device) registry.save({ ...device, sortOrder: index });
    });
    for (const device of registry.list()) await repository?.saveDevice(device);
    publish(set);
  },

  async discover(scope, options = {}) {
    if (!services) {
      set({ discoveryError: 'La découverte n’est pas prête. Rechargez l’application.' });
      return;
    }
    set({ discovering: true, discoveryError: undefined, discovery: scope === 'manual' ? get().discovery : [] });
    try {
      const gateway = gateways.find((item) => item.id === options.gatewayId);
      const hits = await services.discovery.discover(scope, (partial) => set({ discovery: partial }), {
        gateway,
        ipAddress: options.ipAddress,
        model: options.model,
      });
      const discoveryError = hits.length === 0
        ? Platform.OS === 'web'
          ? 'Aucun appareil annoncé. Cette recherche exige le development build Android.'
          : 'Aucun appareil annoncé sur le réseau local.'
        : undefined;
      set({ discovery: hits, discovering: false, discoveryError });
    } catch (error) {
      set({ discovering: false, discoveryError: errorMessage(error) });
    }
  },

  async saveGateway(input) {
    if (!repository || !secrets) throw new DeviceError('La base locale n’est pas ouverte.', 'unavailable');
    assertLanHost(input.address);
    if (!Number.isInteger(input.port) || input.port < 1 || input.port > 65535) {
      throw new DeviceError('Port invalide.', 'protocol');
    }
    const id = input.id ?? `gateway-${Math.random().toString(36).slice(2, 10)}`;
    const secretRef = gatewaySecretKey(id);
    if (input.secret) await secrets.set(secretRef, input.secret);
    const gateway: Gateway = {
      id,
      name: input.name,
      type: input.type,
      address: input.address.trim(),
      port: input.port,
      tls: input.tls,
      baseTopic: input.baseTopic || 'zigbee2mqtt',
      username: input.username,
      secretRef,
      connectionStatus: 'detected',
      capabilities: input.type === 'zigbee2mqtt' ? ['mqtt', 'permit-join', 'import'] : ['websocket', 'import'],
    };
    gateways = [...gateways.filter((item) => item.id !== id), gateway];
    await repository.saveGateway(gateway);
    publish(set);
  },

  async connectGateway(gatewayId) {
    const gateway = gateways.find((item) => item.id === gatewayId);
    if (!gateway || !services || !secrets || !repository) return;
    assertLanHost(gateway.address);
    try {
      const secret = gateway.secretRef ? await secrets.get(gateway.secretRef) : '';
      await services.gateways.connect(gateway, secret ?? '');
      gateway.connectionStatus = 'connected';
      gateway.lastError = undefined;
      await repository.saveGateway(gateway);
      publish(set);
    } catch (error) {
      gateway.connectionStatus = error instanceof DeviceError && error.code === 'auth' ? 'authentication_required' : 'offline';
      gateway.lastError = errorMessage(error);
      await repository.saveGateway(gateway);
      publish(set);
      throw error;
    }
  },

  async importGateway(gatewayId) {
    const gateway = gateways.find((item) => item.id === gatewayId);
    if (!gateway || !services) return;
    const hits = await services.gateways.importDevices(gateway);
    for (const hit of hits) await get().addHit(hit);
  },

  async permitJoin(gatewayId) {
    const gateway = gateways.find((item) => item.id === gatewayId);
    if (!gateway || !services) return;
    await services.gateways.permitJoin(gateway, 60);
  },

  async deleteGateway(gatewayId) {
    services?.gateways.disconnect(gatewayId);
    if (gateways.find((gateway) => gateway.id === gatewayId)?.secretRef) {
      await secrets?.remove(gatewaySecretKey(gatewayId));
    }
    gateways = gateways.filter((gateway) => gateway.id !== gatewayId);
    await repository?.deleteGateway(gatewayId);
    publish(set);
  },

  async inspectUsb() {
    if (!services) return;
    const devices = await services.gateways.listUsb();
    set({ usbDevices: devices as Array<Record<string, unknown>> });
  },
}));
