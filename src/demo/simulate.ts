import { DeviceError } from '../domain/errors';
import { Command, Device, DeviceState } from '../domain/types';

/** Applique une commande uniquement en mémoire. Aucun transport n’est appelé. */
export function applySimulatedCommand(device: Device, command: Command): DeviceState {
  const state: DeviceState = {
    ...device.currentState,
    outlets: device.currentState.outlets ? { ...device.currentState.outlets } : undefined,
  };
  if (command.type === 'setOnOff' && command.outletId) {
    const outlet = state.outlets?.[command.outletId];
    if (!outlet) throw new DeviceError('Sortie simulée inconnue.', 'unsupported');
    state.outlets = { ...state.outlets, [command.outletId]: { ...outlet, on: command.on } };
    state.on = Object.values(state.outlets).some((item) => item.on);
    return state;
  }
  if (command.type === 'setOnOff') {
    state.on = command.on;
    return state;
  }
  if (command.type === 'setBrightness') {
    state.brightness = Math.round(Math.min(100, Math.max(0, command.brightness)));
    state.on = state.brightness > 0;
    return state;
  }
  if (command.type === 'setColorHs') {
    state.hue = command.hue;
    state.saturation = command.saturation;
    state.on = true;
    return state;
  }
  if (command.type === 'setTargetTemperature') {
    state.targetTemperatureC = command.celsius;
    state.heating = (state.currentTemperatureC ?? command.celsius) < command.celsius;
    return state;
  }
  state.mode = command.mode;
  if (command.mode === 'off') state.heating = false;
  return state;
}
