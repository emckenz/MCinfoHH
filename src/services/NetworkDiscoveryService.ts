import { DeviceError } from '../domain/errors';
import { assertLanHost } from '../domain/localAddress';
import { DiscoveryHit } from '../domain/types';
import { BelkinWemoAdapter } from './adapters/BelkinWemoAdapter';
import { LevitonAdapter } from './adapters/LevitonAdapter';
import { MatterAdapter } from './adapters/MatterAdapter';
import { StelproAdapter } from './adapters/StelproAdapter';
import { TPLinkAdapter } from './adapters/TPLinkAdapter';

export class NetworkDiscoveryService {
  constructor(
    private readonly tplink: TPLinkAdapter,
    private readonly wemo: BelkinWemoAdapter,
    private readonly matter: MatterAdapter,
    private readonly leviton: LevitonAdapter,
    private readonly stelpro: StelproAdapter,
  ) {}

  async discoverLocalReport(): Promise<{ hits: DiscoveryHit[]; probed: Array<'kasa' | 'wemo' | 'matter'> }> {
    const jobs: Array<['kasa' | 'wemo' | 'matter', Promise<DiscoveryHit[]>]> = [
      ['kasa', this.tplink.discover()],
      ['wemo', this.wemo.discover()],
      ['matter', this.matter.discover()],
    ];
    const settled = await Promise.allSettled(jobs.map(([, promise]) => promise));
    const hits: DiscoveryHit[] = [];
    const probed: Array<'kasa' | 'wemo' | 'matter'> = [];
    settled.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        probed.push(jobs[index][0]);
        hits.push(...result.value);
      }
    });
    if (probed.length === 0) {
      const reason = settled.find((result): result is PromiseRejectedResult => result.status === 'rejected')?.reason;
      throw reason instanceof Error ? reason : new Error('Découverte locale impossible.');
    }
    return { hits, probed };
  }

  async discoverLocal(): Promise<DiscoveryHit[]> {
    return (await this.discoverLocalReport()).hits;
  }

  async discoverMatter(): Promise<DiscoveryHit[]> {
    return this.matter.discover();
  }

  async identifyManual(ipAddress: string | undefined, model: string | undefined): Promise<DiscoveryHit[]> {
    const hits: DiscoveryHit[] = [];
    if (ipAddress) {
      assertLanHost(ipAddress);
      const kasa = await this.tplink.identify({ ipAddress }).catch(() => null);
      const wemo = await this.wemo.identify({ ipAddress }).catch(() => null);
      if (kasa) hits.push(kasa);
      if (wemo) hits.push(wemo);
    }
    if (model) {
      const leviton = await this.leviton.identify({ model });
      const stelpro = await this.stelpro.identify({ model });
      if (leviton) hits.push({ ...leviton, ipAddress });
      if (stelpro) hits.push({ ...stelpro, ipAddress });
    }
    if (hits.length > 0) return hits;
    if (!ipAddress && !model) throw new DeviceError('Indiquez une adresse IP locale ou un modèle.', 'protocol');
    return [
      {
        id: `manual:${ipAddress ?? 'sans-ip'}:${model ?? 'inconnu'}`,
        name: model ? model : `Appareil ${ipAddress}`,
        manufacturer: 'Inconnu',
        model: model || 'Inconnu',
        type: 'unknown',
        protocol: 'unknown',
        ipAddress,
        capabilities: [],
        connectionStatus: 'incompatible',
        protocolData: {},
        dedupeKeys: [ipAddress, model].filter((value): value is string => Boolean(value)),
        adapterId: 'tplink',
        origin: 'manual',
        compatibilityNote: 'Aucun protocole connu n’a répondu. La découverte ne prouve pas qu’un appareil soit contrôlable, et aucun autre port n’a été balayé.',
      },
    ];
  }
}
