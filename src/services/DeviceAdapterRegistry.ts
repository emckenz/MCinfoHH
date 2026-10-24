import { DeviceError } from '../domain/errors';
import { DeviceAdapter } from '../domain/types';

export class DeviceAdapterRegistry {
  private readonly adapters = new Map<string, DeviceAdapter>();

  register(adapter: DeviceAdapter): void {
    this.adapters.set(adapter.id, adapter);
  }

  get(id: string): DeviceAdapter {
    const adapter = this.adapters.get(id);
    if (!adapter) throw new DeviceError(`Adaptateur absent : ${id}.`, 'unsupported');
    return adapter;
  }

  all(): DeviceAdapter[] {
    return [...this.adapters.values()];
  }
}
