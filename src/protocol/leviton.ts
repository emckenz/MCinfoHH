import { DiscoveryHit } from '../domain/types';

export interface LevitonIdentification {
  family: string;
  radio: string;
  localControl: 'matter-not-implemented' | 'gateway-required' | 'cloud-not-implemented' | 'proprietary-bluetooth' | 'unknown';
  status: DiscoveryHit['connectionStatus'];
  note: string;
}

/**
 * Préfixes publiés par Leviton : « What App Do I Need To Use With My Leviton Smart Dimmer Or Switch? »
 * L'apparence Decora ne suffit pas. Aucune commande My Leviton n'est envoyée : elle sortirait du réseau local.
 */
export function identifyLevitonModel(model: string): LevitonIdentification {
  const normalized = model.trim().toUpperCase().replace(/\s+/g, '');
  const prefix = normalized.slice(0, 2);
  switch (prefix) {
    case 'D2':
    case 'D3':
      return {
        family: prefix === 'D2' ? 'Decora Smart Wi-Fi 2e génération' : 'Decora Smart Wi-Fi 3e génération',
        radio: 'Wi-Fi',
        localControl: 'matter-not-implemented',
        status: 'authentication_required',
        note: 'Leviton indique My Leviton ou Apple Home. Certaines références D2 peuvent recevoir Matter par mise à jour. Le commissionnement Matter n’est pas implémenté, donc aucune commande n’est envoyée.',
      };
    case 'DD':
      return {
        family: 'Decora Digital',
        radio: 'Bluetooth',
        localControl: 'proprietary-bluetooth',
        status: 'incompatible',
        note: 'Gamme Bluetooth Decora Digital. Aucun profil GATT public n’est implémenté. La détection Bluetooth ne rend pas l’appareil contrôlable.',
      };
    case 'DG':
      return {
        family: 'Decora Smart Zigbee',
        radio: 'Zigbee',
        localControl: 'gateway-required',
        status: 'authentication_required',
        note: 'Leviton indique qu’un appareil DG ne se connecte pas directement au téléphone. Il faut une passerelle Zigbee, puis l’importer depuis Zigbee2MQTT ou Home Assistant.',
      };
    case 'DH':
      return {
        family: 'Decora Smart HomeKit',
        radio: 'Wi-Fi / HomeKit',
        localControl: 'matter-not-implemented',
        status: 'authentication_required',
        note: 'Le contrôle local documenté passe par HomeKit. Cette application détecte HomeKit et Matter, sans les commander.',
      };
    case 'DW':
      return {
        family: 'Decora Smart Wi-Fi 1re génération',
        radio: 'Wi-Fi',
        localControl: 'cloud-not-implemented',
        status: 'incompatible',
        note: 'Le contrôle documenté passe par le nuage My Leviton. Il n’existe pas d’API locale documentée. Le nuage n’est pas implémenté, afin de ne pas exposer la maison à Internet.',
      };
    case 'DZ':
    case 'ZW':
      return {
        family: prefix === 'DZ' ? 'Decora Smart Z-Wave' : 'Decora Smart Z-Wave série 700',
        radio: 'Z-Wave',
        localControl: 'gateway-required',
        status: 'authentication_required',
        note: 'Le téléphone n’a pas de radio Z-Wave. Le contrôle local exige un contrôleur, par exemple Z-Wave JS dans Home Assistant, puis un import autorisé.',
      };
    case 'DN':
      return {
        family: 'Decora Smart sans neutre',
        radio: 'Wi-Fi, génération à confirmer',
        localControl: 'unknown',
        status: 'detected',
        note: 'Le préfixe DN figure dans la documentation Wi-Fi Leviton, sans protocole local public identifié. Aucune commande n’est envoyée.',
      };
    default:
      return {
        family: 'Modèle Leviton non reconnu',
        radio: 'Inconnue',
        localControl: 'unknown',
        status: 'detected',
        note: 'Le numéro gravé sur l’étrier n’a pas de préfixe connu (D2, D3, DD, DG, DH, DW, DZ, ZW, DN). L’apparence Decora ne permet pas de supposer une connexion.',
      };
  }
}

export function levitonHit(model: string): DiscoveryHit {
  const identification = identifyLevitonModel(model);
  const dimmer = /6HD|DIM|PD3|D23LP|D26HD|DW6HD|DZ6HD|DG6HD|DH6HD/i.test(model);
  return {
    id: `leviton:${model.trim().toUpperCase()}`,
    name: `Leviton ${model.trim().toUpperCase()}`,
    manufacturer: 'Leviton',
    model: model.trim().toUpperCase(),
    type: dimmer ? 'dimmer' : 'switch',
    protocol: 'leviton-unconfirmed',
    capabilities: [],
    connectionStatus: identification.status,
    protocolData: {
      family: identification.family,
      radio: identification.radio,
      localControl: identification.localControl,
    },
    dedupeKeys: [model.trim().toUpperCase()],
    adapterId: 'leviton',
    origin: 'manual',
    compatibilityNote: identification.note,
  };
}
