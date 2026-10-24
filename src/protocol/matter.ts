import { DiscoveryHit } from '../domain/types';

export interface MatterTxt {
  name?: string;
  vendorProduct?: string;
  discriminator?: string;
  deviceType?: string;
  commissioningMode?: string;
  pairingHint?: string;
}

/** Enregistrements TXT Matter DNS-SD : CM, D, VP, DN, DT, PH. Aucune commande n'en est déduite. */
export function parseMatterTxt(txt: Record<string, string>, fallbackName: string): MatterTxt {
  return {
    name: txt.DN || txt.dn || fallbackName,
    vendorProduct: txt.VP || txt.vp,
    discriminator: txt.D || txt.d,
    deviceType: txt.DT || txt.dt,
    commissioningMode: txt.CM || txt.cm,
    pairingHint: txt.PH || txt.ph,
  };
}

export function matterHit(input: {
  name: string;
  type: string;
  host?: string | null;
  port?: number;
  txt: Record<string, string>;
}): DiscoveryHit {
  const parsed = parseMatterTxt(input.txt, input.name);
  const commissionable = input.type.includes('_matterc');
  const advertisedName = parsed.name || input.name || 'Appareil Matter';
  const manufacturer = /leviton/i.test(advertisedName) ? 'Leviton' : 'Matter';
  return {
    id: `matter:${input.host ?? input.name}:${parsed.discriminator ?? parsed.vendorProduct ?? input.name}`,
    name: advertisedName,
    manufacturer,
    model: parsed.vendorProduct ? `VP ${parsed.vendorProduct}` : 'Matter',
    type: 'unknown',
    protocol: 'matter',
    ipAddress: input.host ?? undefined,
    capabilities: [],
    connectionStatus: 'authentication_required',
    protocolData: {
      serviceType: input.type,
      port: input.port ?? null,
      vendorProduct: parsed.vendorProduct ?? null,
      discriminator: parsed.discriminator ?? null,
      deviceType: parsed.deviceType ?? null,
      commissionable,
    },
    dedupeKeys: [parsed.vendorProduct, parsed.discriminator, input.host].filter((value): value is string => Boolean(value)),
    adapterId: 'matter',
    origin: 'network',
    compatibilityNote: commissionable
      ? 'Appareil Matter en attente de commissionnement. Cette application le détecte, mais ne le commissionne pas et n’envoie aucune commande.'
      : 'Appareil Matter opérationnel détecté. Le contrôle Matter n’est pas implémenté.',
  };
}
