import { DeviceError } from '../../domain/errors';
import { Capability, Command, Device, DeviceAdapter, DeviceState, DiscoveryHit, IdentifyInput } from '../../domain/types';
import { levitonHit } from '../../protocol/leviton';
import { GatewayAccess, commandGateway, connectThroughGateway, readGatewayState } from '../gatewayAccess';

export class LevitonAdapter implements DeviceAdapter {
  id = 'leviton';
  manufacturer = 'Leviton';

  constructor(private readonly gateways: GatewayAccess) {}

  async discover(): Promise<DiscoveryHit[]> {
    return [];
  }

  async identify(input: IdentifyInput): Promise<DiscoveryHit | null> {
    if (!input.model) return null;
    if (!/^(D2|D3|DD|DG|DH|DW|DZ|ZW|DN)/i.test(input.model.trim())) return null;
    return levitonHit(input.model);
  }

  async authenticate(device: Device): Promise<Device> {
    throw new DeviceError(device.compatibilityNote || 'Authentification Leviton non disponible en local.', 'auth');
  }

  async connect(device: Device): Promise<Device> {
    if (this.delegated(device)) return connectThroughGateway(device, this.gateways);
    return { ...device, connectionStatus: device.connectionStatus === 'connected' ? 'authentication_required' : device.connectionStatus };
  }

  getCapabilities(device: Device): Capability[] {
    return this.delegated(device) ? device.capabilities : [];
  }

  async getState(device: Device): Promise<DeviceState> {
    if (!this.delegated(device)) throw new DeviceError(device.compatibilityNote, 'unsupported');
    return readGatewayState(device, this.gateways);
  }

  async executeCommand(device: Device, command: Command): Promise<DeviceState> {
    if (!this.delegated(device)) throw new DeviceError(device.compatibilityNote, 'unsupported');
    return commandGateway(device, command, this.gateways);
  }

  async disconnect(): Promise<void> {
    return;
  }

  private delegated(device: Device): boolean {
    return device.protocol === 'zigbee2mqtt' || device.protocol === 'home-assistant';
  }
}
