import { errorMessage } from '../domain/errors';
import { Device } from '../domain/types';
import { DeviceAdapterRegistry } from './DeviceAdapterRegistry';

export class DeviceConnectionManager {
  constructor(
    private readonly adapters: DeviceAdapterRegistry,
    private readonly delay: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  ) {}

  async reconnect(device: Device): Promise<Device> {
    if (device.simulated) return { ...device, connectionStatus: 'connected', lastError: undefined };
    if (device.protocol === 'unknown' || (device.capabilities.length === 0 && device.protocol.endsWith('unconfirmed'))) {
      return { ...device, connectionStatus: device.connectionStatus === 'offline' ? 'offline' : device.connectionStatus };
    }
    let lastError = 'Connexion impossible.';
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.adapters.get(device.adapterId).connect(device);
      } catch (error) {
        lastError = errorMessage(error);
        if (attempt < 2) await this.delay(1000 * 2 ** attempt);
      }
    }
    return { ...device, connectionStatus: 'offline', lastError };
  }
}
