import { isIpv4 } from './localAddress';

export function subnetFromPrefix(ip: string, prefixLength: number): { network: string; broadcast: string } | null {
  if (!isIpv4(ip) || prefixLength < 0 || prefixLength > 32) return null;
  const address = ipv4ToInt(ip);
  const mask = prefixLength === 0 ? 0 : (0xffffffff << (32 - prefixLength)) >>> 0;
  const network = (address & mask) >>> 0;
  const broadcast = (network | (~mask >>> 0)) >>> 0;
  return { network: intToIpv4(network), broadcast: intToIpv4(broadcast) };
}

export function ipv4ToInt(ip: string): number {
  return ip.split('.').reduce((acc, part) => ((acc << 8) >>> 0) + Number(part), 0) >>> 0;
}

export function intToIpv4(value: number): string {
  return [24, 16, 8, 0].map((shift) => (value >>> shift) & 255).join('.');
}
