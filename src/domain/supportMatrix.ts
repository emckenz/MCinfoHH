export type SupportLevel = 'implemented' | 'discovery-only' | 'identification-only' | 'experimental' | 'unavailable';

export interface SupportEntry {
  id: string;
  device: string;
  protocol: string;
  level: SupportLevel;
  hardwareTest: 'not-run';
  note: string;
}

export const SUPPORT_MATRIX: SupportEntry[] = [
  {
    id: 'tplink-kp400',
    device: 'TP-Link KP400 et Kasa historique (port 9999)',
    protocol: 'UDP/TCP 9999, JSON chiffré par XOR 0xAB, documenté par python-kasa et des captures publiques',
    level: 'implemented',
    hardwareTest: 'not-run',
    note: 'Prises à plusieurs sorties via context.child_ids. Le protocole KLAP des firmwares récents n’est pas implémenté : l’appareil reste en authentification requise.',
  },
  {
    id: 'belkin-wemo',
    device: 'Belkin WeMo',
    protocol: 'SSDP puis setup.xml et SOAP basicevent, documenté par pywemo',
    level: 'implemented',
    hardwareTest: 'not-run',
    note: 'Les capacités viennent des services réellement annoncés. L’intensité n’est envoyée que si l’argument brightness existe dans le SCPD.',
  },
  {
    id: 'leviton',
    device: 'Leviton Decora',
    protocol: 'Aucun protocole local unique. Classification par préfixe publié par Leviton.',
    level: 'identification-only',
    hardwareTest: 'not-run',
    note: 'DW : nuage My Leviton, non implémenté. DZ/ZW : Z-Wave. DG : Zigbee. D2/D3/DH : Matter ou HomeKit, commissionnement non implémenté. DD : Bluetooth propriétaire.',
  },
  {
    id: 'stelpro',
    device: 'Stelpro Maestro et convecteur Orléans',
    protocol: 'Zigbee documenté par Zigbee2MQTT pour SMT402, STZB402, SORB et ST218. Pas de Wi-Fi direct pour l’Orléans.',
    level: 'implemented',
    hardwareTest: 'not-run',
    note: 'Le contrôle passe uniquement par une passerelle Zigbee2MQTT ou Home Assistant déjà autorisée. Aucune commande directe n’est envoyée à l’appareil.',
  },
  {
    id: 'matter',
    device: 'Matter',
    protocol: 'DNS-SD _matter._tcp et _matterc._udp',
    level: 'discovery-only',
    hardwareTest: 'not-run',
    note: 'Découverte et lecture des enregistrements TXT. Pas de commissionnement ni de commande.',
  },
  {
    id: 'ble',
    device: 'Bluetooth Low Energy',
    protocol: 'Annonces BLE et lecture GATT',
    level: 'discovery-only',
    hardwareTest: 'not-run',
    note: 'Un périphérique détecté n’est pas contrôlable. Aucune écriture GATT.',
  },
  {
    id: 'zigbee2mqtt',
    device: 'Passerelle Zigbee2MQTT',
    protocol: 'MQTT 3.1.1 vers les sujets documentés zigbee2mqtt/<nom>/set et bridge/devices',
    level: 'implemented',
    hardwareTest: 'not-run',
    note: 'TLS vérifié par défaut. Les identifiants restent dans le stockage sécurisé.',
  },
  {
    id: 'home-assistant',
    device: 'Home Assistant (ZHA, MQTT, Z-Wave JS)',
    protocol: 'API WebSocket locale documentée',
    level: 'implemented',
    hardwareTest: 'not-run',
    note: 'Importe les entités switch, light et climate de ces plateformes. Le jeton n’est pas enregistré en clair.',
  },
  {
    id: 'usb-zigbee',
    device: 'Adaptateur Zigbee USB-C',
    protocol: 'Inventaire USB Host uniquement',
    level: 'experimental',
    hardwareTest: 'not-run',
    note: 'Aucun coordonnateur Zigbee n’est démarré. L’option n’est pas un contrôle fonctionnel.',
  },
];

export const LEVEL_LABEL: Record<SupportLevel, string> = {
  implemented: 'Implémenté, non vérifié sur le matériel de la maison',
  'discovery-only': 'Découverte seulement',
  'identification-only': 'Identification seulement',
  experimental: 'Expérimental, non fonctionnel',
  unavailable: 'Non disponible',
};
