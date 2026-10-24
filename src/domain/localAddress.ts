import { DeviceError } from './errors';

export function assertLanHost(host: string): void {
  const value = host.trim().toLowerCase().replace(/^\[|\]$/g, '');
  if (!value) throw new DeviceError('Adresse vide.', 'protocol');
  if (value.includes(':')) {
    if (!isLocalIpv6(value)) {
      throw new DeviceError('Adresse refusée : Maison n’envoie des commandes qu’au réseau local.', 'protocol');
    }
    return;
  }
  if (isIpv4(value)) {
    if (!isPrivateIpv4(value)) {
      throw new DeviceError('Adresse refusée : Maison n’envoie des commandes qu’au réseau local.', 'protocol');
    }
    return;
  }
  const singleLabel = !value.includes('.');
  const allowedSuffix = ['.local', '.lan', '.home', '.internal', '.home.arpa'].some((suffix) => value.endsWith(suffix));
  if (value === 'localhost' || singleLabel || allowedSuffix) return;
  throw new DeviceError('Nom d’hôte refusé. Utilisez une adresse IP privée ou un nom en .local.', 'protocol');
}

export function isIpv4(value: string): boolean {
  const parts = value.split('.');
  if (parts.length !== 4) return false;
  return parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) >= 0 && Number(part) <= 255);
}

export function isPrivateIpv4(value: string): boolean {
  if (!isIpv4(value)) return false;
  const [a, b] = value.split('.').map(Number);
  if (a === 10 || a === 127) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

function isLocalIpv6(value: string): boolean {
  if (value === '::1') return true;
  return value.startsWith('fe80:') || value.startsWith('fc') || value.startsWith('fd');
}
