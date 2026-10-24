import { DiscoveryHit } from '../domain/types';

export interface StelproIdentification {
  family: string;
  radio: string;
  status: DiscoveryHit['connectionStatus'];
  note: string;
  deviceType: 'thermostat' | 'convector' | 'unknown';
}

const ZIGBEE_MODELS: Record<string, { family: string; deviceType: 'thermostat' | 'convector' }> = {
  SMT402: { family: 'Maestro Zigbee', deviceType: 'thermostat' },
  SMT402AD: { family: 'Maestro Zigbee', deviceType: 'thermostat' },
  STZB402: { family: 'Ki Zigbee', deviceType: 'thermostat' },
  'STZB402+': { family: 'Ki Zigbee', deviceType: 'thermostat' },
  SORB: { family: 'Orléans Zigbee', deviceType: 'convector' },
  ST218: { family: 'Convecteur Ki Zigbee', deviceType: 'convector' },
};

/**
 * Les modèles Zigbee cités sont ceux publiés par Zigbee2MQTT et Stelpro.
 * L'Orléans n'est pas traité comme un appareil Wi-Fi : la fiche produit décrit un thermostat Zigbee optionnel.
 */
export function identifyStelproModel(model: string): StelproIdentification {
  const normalized = model.trim().toUpperCase().replace(/\s+/g, '');
  const zigbee = ZIGBEE_MODELS[normalized] ?? (normalized.startsWith('STZB402') ? ZIGBEE_MODELS.STZB402 : undefined);
  if (zigbee) {
    return {
      family: zigbee.family,
      radio: 'Zigbee',
      status: 'authentication_required',
      deviceType: zigbee.deviceType,
      note: 'Modèle Zigbee documenté. Il ne se commande pas directement depuis le téléphone. Ajoutez-le à Zigbee2MQTT ou à ZHA, puis importez la passerelle.',
    };
  }
  if (normalized.startsWith('STZW402')) {
    return {
      family: 'Ki Z-Wave',
      radio: 'Z-Wave',
      status: 'authentication_required',
      deviceType: 'thermostat',
      note: 'STZW402 est la variante Z-Wave, pas Zigbee. Cette application ne parle pas Z-Wave. Un contrôleur Home Assistant peut l’importer si vous l’autorisez.',
    };
  }
  if (normalized.startsWith('SOR')) {
    return {
      family: 'Convecteur Orléans',
      radio: 'Zigbee seulement si l’option est présente',
      status: 'detected',
      deviceType: 'convector',
      note: 'Le convecteur Orléans n’a pas de Wi-Fi direct. La variante connectée utilise Zigbee (souvent SORB ou ST218) et une passerelle. Le modèle exact n’est pas confirmé, donc aucune commande n’est envoyée.',
    };
  }
  if (normalized.includes('WIFI') || normalized.includes('WI-FI')) {
    return {
      family: 'Stelpro Wi-Fi',
      radio: 'Wi-Fi',
      status: 'incompatible',
      deviceType: 'thermostat',
      note: 'Aucun protocole local documenté n’a été implémenté pour un thermostat Stelpro Wi-Fi. Le nuage du fabricant n’est pas utilisé.',
    };
  }
  return {
    family: 'Stelpro non identifié',
    radio: 'Inconnue',
    status: 'detected',
    deviceType: 'unknown',
    note: 'Un boîtier blanc à affichage numérique n’est pas forcément un Maestro connecté. Inscrivez le modèle exact (SMT402, STZB402, STZW402, SORB, ST218) avant tout contrôle.',
  };
}

export function stelproHit(model: string): DiscoveryHit {
  const identification = identifyStelproModel(model);
  return {
    id: `stelpro:${model.trim().toUpperCase()}`,
    name: `Stelpro ${model.trim().toUpperCase()}`,
    manufacturer: 'Stelpro',
    model: model.trim().toUpperCase(),
    type: identification.deviceType === 'unknown' ? 'thermostat' : identification.deviceType,
    protocol: 'stelpro-unconfirmed',
    capabilities: [],
    connectionStatus: identification.status,
    protocolData: { family: identification.family, radio: identification.radio },
    dedupeKeys: [model.trim().toUpperCase()],
    adapterId: 'stelpro',
    origin: 'manual',
    compatibilityNote: identification.note,
  };
}
