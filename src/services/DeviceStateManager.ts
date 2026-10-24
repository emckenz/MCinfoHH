import { errorMessage } from '../domain/errors';
import { Device } from '../domain/types';
import { DeviceAdapterRegistry } from './DeviceAdapterRegistry';

export class DeviceStateManager {
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly adapters: DeviceAdapterRegistry) {}

  start(getDevices: () => Device[], onDevice: (device: Device) => void, intervalMs = 30000): void {
    this.stop();
    this.timer = setInterval(() => {
      void this.refresh(getDevices, onDevice);
    }, intervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async refresh(getDevices: () => Device[], onDevice: (device: Device) => void): Promise<void> {
    for (const device of getDevices()) {
      if (device.simulated || device.connectionStatus !== 'connected') continue;
      if (device.protocol === 'zigbee2mqtt' || device.protocol === 'matter' || device.protocol === 'ble') continue;
      try {
        const state = await this.adapters.get(device.adapterId).getState(device);
        onDevice({ ...device, currentState: state, lastSeen: Date.now(), connectionStatus: 'connected', lastError: undefined });
      } catch (error) {
        onDevice({ ...device, connectionStatus: 'offline', lastError: errorMessage(error) });
      }
    }
  }
}
