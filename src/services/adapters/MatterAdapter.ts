import { DeviceError } from '../../domain/errors';
import { Capability, Command, Device, DeviceAdapter, DeviceState, DiscoveryHit, IdentifyInput } from '../../domain/types';
import { matterHit } from '../../protocol/matter';
import { NetworkTransport } from '../../transport/types';

const MATTER_TYPES = ['_matter._tcp.', '_matterc._udp.', '_hap._tcp.'];

export class MatterAdapter implements DeviceAdapter {
  id = 'matter';
  manufacturer = 'Matter';

  constructor(private readonly transport: NetworkTransport) {}

  async discover(): Promise<DiscoveryHit[]> {
    const services = await this.transport.mdnsBrowse(MATTER_TYPES, 2500);
    return services.map((service) => {
      if (service.type.includes('_hap')) {
        return {
          ...matterHit(service),
          id: `homekit:${service.host ?? service.name}`,
          protocol: 'homekit' as const,
          adapterId: 'matter',
          compatibilityNote: 'Accessoire HomeKit détecté par DNS-SD. Le contrôle HomeKit n’est pas implémenté.',
        };
      }
      return matterHit(service);
    });
  }

  async identify(input: IdentifyInput): Promise<DiscoveryHit | null> {
    if (!input.ipAddress) return null;
    const found = await this.discover();
    return found.find((hit) => hit.ipAddress === input.ipAddress) ?? null;
  }

  async authenticate(device: Device): Promise<Device> {
    throw new DeviceError('Le commissionnement Matter n’est pas implémenté. Aucune session n’a été ouverte.', 'auth');
  }

  async connect(device: Device): Promise<Device> {
    return { ...device, connectionStatus: 'authentication_required', hardwareVerified: false };
  }

  getCapabilities(): Capability[] {
    return [];
  }

  async getState(): Promise<DeviceState> {
    throw new DeviceError('État Matter indisponible : le contrôleur Matter n’est pas implémenté.', 'unsupported');
  }

  async executeCommand(_device: Device, _command: Command): Promise<DeviceState> {
    throw new DeviceError('Aucune commande Matter n’est envoyée. Le commissionnement n’est pas implémenté.', 'unsupported');
  }

  async disconnect(): Promise<void> {
    return;
  }
}
