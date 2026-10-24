import { DeviceError } from '../domain/errors';
import { Json } from '../domain/types';
import { concat, decodeUtf8, utf8 } from './bytes';

const INITIAL_KEY = 171;

/**
 * Chiffrement Kasa historique.
 * Source : python-kasa et captures décrites par softScheck / housekasa.
 * Premier octet XOR 0xAB, puis chaque octet clair est combiné avec le chiffré précédent.
 * UDP envoie le JSON chiffré seul. TCP préfixe la longueur big-endian du JSON.
 */
export function encryptKasa(plain: string): Uint8Array {
  const bytes = utf8(plain);
  const out = new Uint8Array(bytes.length);
  let key = INITIAL_KEY;
  for (let index = 0; index < bytes.length; index += 1) {
    const cipher = key ^ bytes[index];
    out[index] = cipher;
    key = cipher;
  }
  return out;
}

export function decryptKasa(payload: Uint8Array): string {
  const out = new Uint8Array(payload.length);
  let key = INITIAL_KEY;
  for (let index = 0; index < payload.length; index += 1) {
    const cipher = payload[index];
    out[index] = key ^ cipher;
    key = cipher;
  }
  return decodeUtf8(out);
}

export function frameKasaTcp(plain: string): Uint8Array {
  const encrypted = encryptKasa(plain);
  const header = new Uint8Array(4);
  const view = new DataView(header.buffer);
  view.setUint32(0, plain.length);
  return concat([header, encrypted]);
}

export function unframeKasaTcp(payload: Uint8Array): string {
  if (payload.length < 4) throw new DeviceError('Réponse Kasa trop courte.', 'protocol');
  const length = new DataView(payload.buffer, payload.byteOffset, payload.byteLength).getUint32(0);
  if (length !== payload.length - 4) throw new DeviceError('Trame Kasa inattendue.', 'protocol');
  return decryptKasa(payload.slice(4));
}

export const KASA_SYSINFO_QUERY = '{"system":{"get_sysinfo":{}}}';

export interface KasaChild {
  id: string;
  state?: number;
  alias?: string;
}

export interface KasaLightState {
  onOff?: number;
  brightness?: number;
  hue?: number;
  saturation?: number;
  colorTemp?: number;
}

export interface KasaSysInfo {
  model: string;
  deviceId: string;
  alias: string;
  hardwareVersion?: string;
  firmwareVersion?: string;
  mac?: string;
  micType?: string;
  relayState?: number;
  brightness?: number;
  children: KasaChild[];
  lightState?: KasaLightState;
}

export function parseKasaSysInfo(message: string): KasaSysInfo {
  const parsed = JSON.parse(message) as { system?: { get_sysinfo?: Record<string, unknown> } };
  const info = parsed.system?.get_sysinfo;
  if (!info || typeof info !== 'object') throw new DeviceError('Réponse Kasa sans get_sysinfo.', 'protocol');
  const children = Array.isArray(info.children)
    ? info.children.map((child) => {
        const record = child as Record<string, unknown>;
        return {
          id: String(record.id ?? ''),
          state: typeof record.state === 'number' ? record.state : undefined,
          alias: typeof record.alias === 'string' ? record.alias : undefined,
        };
      })
    : [];
  const light = info.light_state as Record<string, unknown> | undefined;
  return {
    model: String(info.model ?? 'Kasa'),
    deviceId: String(info.deviceId ?? ''),
    alias: String(info.alias ?? info.model ?? 'Kasa'),
    hardwareVersion: typeof info.hw_ver === 'string' ? info.hw_ver : undefined,
    firmwareVersion: typeof info.sw_ver === 'string' ? info.sw_ver : undefined,
    mac: typeof info.mac === 'string' ? info.mac : undefined,
    micType: typeof info.mic_type === 'string' ? info.mic_type : undefined,
    relayState: typeof info.relay_state === 'number' ? info.relay_state : undefined,
    brightness: typeof info.brightness === 'number' ? info.brightness : undefined,
    children,
    lightState: light
      ? {
          onOff: typeof light.on_off === 'number' ? light.on_off : undefined,
          brightness: typeof light.brightness === 'number' ? light.brightness : undefined,
          hue: typeof light.hue === 'number' ? light.hue : undefined,
          saturation: typeof light.saturation === 'number' ? light.saturation : undefined,
          colorTemp: typeof light.color_temp === 'number' ? light.color_temp : undefined,
        }
      : undefined,
  };
}

/** L'identifiant de commande d'une sortie KP400 est deviceId + index à deux caractères. */
export function kasaChildCommandId(deviceId: string, childId: string): string {
  if (childId.length > 2) return childId;
  return `${deviceId}${childId}`;
}

export function kasaSetRelayState(state: 0 | 1, childIds?: string[]): Json {
  const command: { system: Json; context?: Json } = { system: { set_relay_state: { state } } };
  if (childIds && childIds.length > 0) command.context = { child_ids: childIds };
  return command;
}

/** HS220 et gradateurs IoT : smartlife.iot.dimmer.set_brightness, échelle 0–100 (python-kasa). */
export function kasaSetDimmerBrightness(brightness: number): Json {
  return { 'smartlife.iot.dimmer': { set_brightness: { brightness } } };
}

/** Ampoules Kasa : smartlife.iot.smartbulb.lightingservice.transition_light_state (python-kasa). */
export function kasaTransitionLight(partial: Record<string, number>): Json {
  return {
    'smartlife.iot.smartbulb.lightingservice': {
      transition_light_state: { ignore_default: 1, transition_period: 0, ...partial },
    },
  };
}

export function assertKasaSuccess(message: string): void {
  const parsed = JSON.parse(message) as Record<string, unknown>;
  const code = findErrCode(parsed);
  if (code !== undefined && code !== 0) {
    throw new DeviceError(`L’appareil Kasa a refusé la commande (err_code ${code}).`, 'rejected');
  }
}

function findErrCode(value: unknown): number | undefined {
  if (!value || typeof value !== 'object') return undefined;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findErrCode(item);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.err_code === 'number') return record.err_code;
  for (const nested of Object.values(record)) {
    const found = findErrCode(nested);
    if (found !== undefined) return found;
  }
  return undefined;
}
