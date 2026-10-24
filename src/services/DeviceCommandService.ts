import { DeviceError } from '../domain/errors';
import { Capability, Command, Device } from '../domain/types';
import { applySimulatedCommand } from '../demo/simulate';
import { DeviceAdapterRegistry } from './DeviceAdapterRegistry';

export class DeviceCommandService {
  constructor(private readonly adapters: DeviceAdapterRegistry) {}

  async execute(device: Device, command: Command): Promise<Device> {
    assertCommand(device.capabilities, command);
    if (device.simulated) {
      return {
        ...device,
        currentState: applySimulatedCommand(device, command),
        connectionStatus: 'connected',
        hardwareVerified: false,
        lastError: undefined,
        lastSeen: Date.now(),
      };
    }
    const adapter = this.adapters.get(device.adapterId);
    const state = await adapter.executeCommand(device, command);
    return {
      ...device,
      currentState: state,
      connectionStatus: 'connected',
      hardwareVerified: true,
      lastSeen: Date.now(),
      lastError: undefined,
    };
  }
}

export function assertCommand(capabilities: Capability[], command: Command): void {
  if (command.type === 'setOnOff') {
    if (command.outletId) {
      if (!capabilities.some((capability) => capability.kind === 'outlet' && capability.outletId === command.outletId && capability.writable)) {
        throw new DeviceError('Sortie non commandable.', 'unsupported');
      }
      return;
    }
    if (!capabilities.some((capability) => capability.kind === 'onOff' && capability.writable)) {
      throw new DeviceError('Cet appareil n’annonce pas de commande marche/arrêt.', 'unsupported');
    }
    return;
  }
  if (command.type === 'setBrightness' && !capabilities.some((capability) => capability.kind === 'brightness' && capability.writable)) {
    throw new DeviceError('Intensité non disponible.', 'unsupported');
  }
  if (command.type === 'setColorHs' && !capabilities.some((capability) => capability.kind === 'colorHs' && capability.writable)) {
    throw new DeviceError('Couleur non disponible.', 'unsupported');
  }
  if (command.type === 'setTargetTemperature' || command.type === 'setMode') {
    const thermostat = capabilities.find((capability) => capability.kind === 'thermostat' && capability.writable);
    if (!thermostat) throw new DeviceError('Thermostat non commandable.', 'unsupported');
    if (command.type === 'setTargetTemperature' && thermostat.min !== undefined && thermostat.max !== undefined) {
      if (command.celsius < thermostat.min || command.celsius > thermostat.max) {
        throw new DeviceError(`Consigne hors plage (${thermostat.min} à ${thermostat.max} °C).`, 'rejected');
      }
    }
    if (command.type === 'setMode' && thermostat.modes && !thermostat.modes.includes(command.mode)) {
      throw new DeviceError('Mode non annoncé par l’appareil.', 'unsupported');
    }
  }
}
