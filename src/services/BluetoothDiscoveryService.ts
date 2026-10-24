import { DiscoveryHit } from '../domain/types';
import { BluetoothAdapter } from './adapters/BluetoothAdapter';

export class BluetoothDiscoveryService {
  constructor(private readonly bluetooth: BluetoothAdapter) {}

  discover(): Promise<DiscoveryHit[]> {
    return this.bluetooth.discover();
  }

  inspect(address: string): Promise<DiscoveryHit | null> {
    return this.bluetooth.identify({ bleIdentifier: address });
  }
}
