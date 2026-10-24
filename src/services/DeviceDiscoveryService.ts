import { DiscoveryHit } from '../domain/types';
import { BluetoothDiscoveryService } from './BluetoothDiscoveryService';
import { NetworkDiscoveryService } from './NetworkDiscoveryService';
import { ZigbeeGatewayService } from './ZigbeeGatewayService';
import { Gateway } from '../domain/types';

export type DiscoveryScope = 'auto' | 'wifi' | 'bluetooth' | 'matter' | 'gateway' | 'manual';

export class DeviceDiscoveryService {
  constructor(
    private readonly network: NetworkDiscoveryService,
    private readonly bluetooth: BluetoothDiscoveryService,
    private readonly gateways: ZigbeeGatewayService,
  ) {}

  async discover(
    scope: DiscoveryScope,
    onProgress: (hits: DiscoveryHit[]) => void,
    options: { gateway?: Gateway; ipAddress?: string; model?: string } = {},
  ): Promise<DiscoveryHit[]> {
    const hits: DiscoveryHit[] = [];
    const push = (found: DiscoveryHit[]) => {
      hits.push(...found);
      onProgress([...hits]);
    };
    if (scope === 'auto' || scope === 'wifi') push(await this.network.discoverLocal());
    if (scope === 'matter') push(await this.network.discoverMatter());
    if (scope === 'auto' || scope === 'bluetooth') push(await this.bluetooth.discover());
    if (scope === 'gateway' && options.gateway) push(await this.gateways.importDevices(options.gateway));
    if (scope === 'manual') push(await this.network.identifyManual(options.ipAddress, options.model));
    return dedupeHits(hits);
  }
}

function dedupeHits(hits: DiscoveryHit[]): DiscoveryHit[] {
  const seen = new Set<string>();
  return hits.filter((hit) => {
    if (seen.has(hit.id)) return false;
    seen.add(hit.id);
    return true;
  });
}
