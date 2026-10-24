import { DeviceError } from '../../domain/errors';
import { Capability, Command, Device, DeviceAdapter, DeviceState, DiscoveryHit, IdentifyInput } from '../../domain/types';
import { NetworkTransport } from '../../transport/types';

export class BluetoothAdapter implements DeviceAdapter {
  id = 'bluetooth';
  manufacturer = 'Bluetooth';

  constructor(private readonly transport: NetworkTransport) {}

  async discover(): Promise<DiscoveryHit[]> {
    const advertisements = await this.transport.bleScan(6000);
    return advertisements.map((advertisement) => ({
      id: `ble:${advertisement.address}`,
      name: advertisement.name || 'Périphérique BLE',
      manufacturer: 'Inconnu',
      model: advertisement.serviceUuids[0] || 'BLE',
      type: 'unknown' as const,
      protocol: 'ble' as const,
      bleIdentifier: advertisement.address,
      capabilities: [],
      connectionStatus: 'detected' as const,
      protocolData: {
        rssi: advertisement.rssi,
        serviceUuids: advertisement.serviceUuids,
        manufacturerIds: advertisement.manufacturerIds,
      },
      dedupeKeys: [advertisement.address],
      adapterId: 'bluetooth',
      origin: 'bluetooth' as const,
      compatibilityNote: 'Périphérique BLE détecté. La présence d’une annonce ne le rend pas contrôlable. Aucune écriture GATT n’est effectuée.',
    }));
  }

  async identify(input: IdentifyInput): Promise<DiscoveryHit | null> {
    if (!input.bleIdentifier) return null;
    const inspection = await this.transport.bleInspect(input.bleIdentifier, 12000);
    return {
      id: `ble:${inspection.address}`,
      name: inspection.name || 'Périphérique BLE',
      manufacturer: 'Inconnu',
      model: 'GATT',
      type: 'unknown',
      protocol: 'ble',
      bleIdentifier: inspection.address,
      capabilities: [],
      connectionStatus: 'incompatible',
      protocolData: {
        services: inspection.services.map((service) => ({
          uuid: service.uuid,
          characteristics: service.characteristics.map((characteristic) => ({
            uuid: characteristic.uuid,
            properties: characteristic.properties,
            error: characteristic.error,
          })),
        })),
      },
      dedupeKeys: [inspection.address],
      adapterId: 'bluetooth',
      origin: 'bluetooth',
      compatibilityNote: 'Services GATT lus en lecture seule. Aucun profil de commande connu n’a été appliqué.',
    };
  }

  async authenticate(device: Device): Promise<Device> {
    throw new DeviceError('Aucun appairage Bluetooth n’est lancé automatiquement.', 'auth');
  }

  async connect(device: Device): Promise<Device> {
    if (!device.bleIdentifier) return { ...device, connectionStatus: 'offline' };
    const identified = await this.identify({ bleIdentifier: device.bleIdentifier });
    return {
      ...device,
      protocolData: identified?.protocolData ?? device.protocolData,
      connectionStatus: 'incompatible',
      hardwareVerified: false,
      lastSeen: Date.now(),
      compatibilityNote: identified?.compatibilityNote ?? device.compatibilityNote,
    };
  }

  getCapabilities(): Capability[] {
    return [];
  }

  async getState(): Promise<DeviceState> {
    throw new DeviceError('Aucun état contrôlable n’est exposé pour ce périphérique BLE.', 'unsupported');
  }

  async executeCommand(): Promise<DeviceState> {
    throw new DeviceError('Un périphérique BLE détecté n’est pas contrôlé automatiquement.', 'unsupported');
  }

  async disconnect(): Promise<void> {
    return;
  }
}
