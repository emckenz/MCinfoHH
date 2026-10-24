import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

export interface SecretStore {
  persistent: boolean;
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

const memory = new Map<string, string>();

export const memorySecrets: SecretStore = {
  persistent: false,
  async get(key) {
    return memory.get(key) ?? null;
  },
  async set(key, value) {
    memory.set(key, value);
  },
  async remove(key) {
    memory.delete(key);
  },
};

const secureSecrets: SecretStore = {
  persistent: true,
  get(key) {
    return SecureStore.getItemAsync(key);
  },
  async set(key, value) {
    await SecureStore.setItemAsync(key, value);
  },
  async remove(key) {
    await SecureStore.deleteItemAsync(key);
  },
};

export function createSecretStore(): SecretStore {
  return Platform.OS === 'web' ? memorySecrets : secureSecrets;
}

export function gatewaySecretKey(gatewayId: string): string {
  return `gateway.${gatewayId}.secret`;
}
