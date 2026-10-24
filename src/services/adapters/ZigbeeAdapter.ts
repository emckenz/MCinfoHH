import { DeviceError } from '../../domain/errors';
import { Capability, Command, Device, DeviceAdapter, DeviceState, DiscoveryHit, IdentifyInput } from '../../domain/types';
import { GatewayAccess, commandGateway, connectThroughGateway, readGatewayState } from '../gatewayAccess';

export class ZigbeeAdapter implements DeviceAdapter {
  id = 'zigbee';
  manufacturer = 'Zigbee';

  constructor(private readonly gateways: GatewayAccess) {}

  async discover(): Promise<DiscoveryHit[]> {
    return [];
  }

  async identify(_input: IdentifyInput): Promise<DiscoveryHit | null> {
    return null;
  }

  async authenticate(device: Device): Promise<Device> {
    throw new DeviceError('L’authentification se fait sur la passerelle, pas sur l’appareil Zigbee.', 'auth');
  }

  async connect(device: Device): Promise<Device> {
    return connectThroughGateway(device, this.gateways);
  }

  getCapabilities(device: Device): Capability[] {
    return device.capabilities;
  }

  async getState(device: Device): Promise<DeviceState> {
    return readGatewayState(device, this.gateways);
  }

  async executeCommand(device: Device, command: Command): Promise<DeviceState> {
    return commandGateway(device, command, this.gateways);
  }

  async disconnect(): Promise<void> {
    return;
  }
}
