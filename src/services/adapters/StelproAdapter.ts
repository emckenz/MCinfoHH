import { DeviceError } from '../../domain/errors';
import { Capability, Command, Device, DeviceAdapter, DeviceState, DiscoveryHit, IdentifyInput } from '../../domain/types';
import { stelproHit } from '../../protocol/stelpro';
import { GatewayAccess, commandGateway, connectThroughGateway, readGatewayState } from '../gatewayAccess';

export class StelproAdapter implements DeviceAdapter {
  id = 'stelpro';
  manufacturer = 'Stelpro';

  constructor(private readonly gateways: GatewayAccess) {}

  async discover(): Promise<DiscoveryHit[]> {
    return [];
  }

  async identify(input: IdentifyInput): Promise<DiscoveryHit | null> {
    if (!input.model) return null;
    if (!/^(SMT402|STZB402|STZW402|SORB|ST218|SOR|STELPRO)/i.test(input.model.trim())) return null;
    return stelproHit(input.model);
  }

  async authenticate(device: Device): Promise<Device> {
    throw new DeviceError('Stelpro se commande par sa passerelle Zigbee ou Z-Wave, pas par un mot de passe direct.', 'auth');
  }

  async connect(device: Device): Promise<Device> {
    if (!this.delegated(device)) {
      return { ...device, hardwareVerified: false };
    }
    return connectThroughGateway(device, this.gateways);
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
    if ((command.type === 'setTargetTemperature' || command.type === 'setMode') && !device.capabilities.some((capability) => capability.kind === 'thermostat')) {
      throw new DeviceError('Ce modèle Stelpro n’expose pas encore de thermostat via la passerelle.', 'unsupported');
    }
    return commandGateway(device, command, this.gateways);
  }

  async disconnect(): Promise<void> {
    return;
  }

  private delegated(device: Device): boolean {
    return device.protocol === 'zigbee2mqtt' || device.protocol === 'home-assistant';
  }
}
