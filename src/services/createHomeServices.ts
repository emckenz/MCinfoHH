import { NetworkTransport } from '../transport/types';
import { BelkinWemoAdapter } from './adapters/BelkinWemoAdapter';
import { BluetoothAdapter } from './adapters/BluetoothAdapter';
import { LevitonAdapter } from './adapters/LevitonAdapter';
import { MatterAdapter } from './adapters/MatterAdapter';
import { StelproAdapter } from './adapters/StelproAdapter';
import { TPLinkAdapter } from './adapters/TPLinkAdapter';
import { ZigbeeAdapter } from './adapters/ZigbeeAdapter';
import { BluetoothDiscoveryService } from './BluetoothDiscoveryService';
import { DeviceAdapterRegistry } from './DeviceAdapterRegistry';
import { DeviceCommandService } from './DeviceCommandService';
import { DeviceConnectionManager } from './DeviceConnectionManager';
import { DeviceDiscoveryService } from './DeviceDiscoveryService';
import { DeviceStateManager } from './DeviceStateManager';
import { NetworkDiscoveryService } from './NetworkDiscoveryService';
import { ZigbeeGatewayService } from './ZigbeeGatewayService';
import { HaSocket } from './HomeAssistantClient';

export interface HomeServices {
  adapters: DeviceAdapterRegistry;
  discovery: DeviceDiscoveryService;
  commands: DeviceCommandService;
  connections: DeviceConnectionManager;
  states: DeviceStateManager;
  gateways: ZigbeeGatewayService;
}

export function createHomeServices(transport: NetworkTransport, sockets?: (url: string) => HaSocket): HomeServices {
  const gateways = new ZigbeeGatewayService(transport, sockets);
  const tplink = new TPLinkAdapter(transport);
  const wemo = new BelkinWemoAdapter(transport);
  const matter = new MatterAdapter(transport);
  const bluetooth = new BluetoothAdapter(transport);
  const adapters = new DeviceAdapterRegistry();
  for (const adapter of [
    tplink,
    wemo,
    matter,
    bluetooth,
    new LevitonAdapter(gateways),
    new StelproAdapter(gateways),
    new ZigbeeAdapter(gateways),
  ]) {
    adapters.register(adapter);
  }
  return {
    adapters,
    discovery: new DeviceDiscoveryService(new NetworkDiscoveryService(tplink, wemo, matter, adapters.get('leviton') as LevitonAdapter, adapters.get('stelpro') as StelproAdapter), new BluetoothDiscoveryService(bluetooth), gateways),
    commands: new DeviceCommandService(adapters),
    connections: new DeviceConnectionManager(adapters),
    states: new DeviceStateManager(adapters),
    gateways,
  };
}
