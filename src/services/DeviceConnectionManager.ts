import { errorMessage } from '../domain/errors';
import { Device } from '../domain/types';
import { DeviceAdapterRegistry } from './DeviceAdapterRegistry';

export class DeviceConnectionManager {
  constructor(
    private readonly adapters: DeviceAdapterRegistry,
    private readonly delay: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  ) {}

  async reconnect(device: Device, attempts = 3): Promise<Device> {
    if (device.simulated) return { ...device, connectionStatus: 'connected', lastError: undefined };
    if (device.protocol === 'unknown' || (device.capabilities.length === 0 && device.protocol.endsWith('unconfirmed'))) {
      return { ...device, connectionStatus: device.connectionStatus === 'offline' ? 'offline' : device.connectionStatus };
    }
    const tries = Math.max(1, attempts);
    let lastError = 'Connexion impossible.';
    for (let attempt = 0; attempt < tries; attempt += 1) {
      try {
        return await this.adapters.get(device.adapterId).connect(device);
      } catch (error) {
        lastError = errorMessage(error);
        if (attempt < tries - 1) await this.delay(1000 * 2 ** attempt);
      }
    }
    return { ...device, connectionStatus: 'offline', lastError };
  }
}
