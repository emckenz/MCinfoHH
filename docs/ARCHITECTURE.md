# Architecture

Maison sépare le modèle, les protocoles documentés, les adaptateurs et l’interface. Un fabricant n’est jamais supposé commandable parce qu’il a été vu sur le réseau.

## Services

| Service | Rôle |
| --- | --- |
| `DeviceDiscoveryService` | Recherche automatique, Wi-Fi, Bluetooth, Matter, passerelle ou IP manuelle. Les résultats arrivent au fil de l’eau. |
| `NetworkDiscoveryService` | Kasa, WeMo et DNS-SD, puis identification manuelle. Pas de balayage de ports. |
| `BluetoothDiscoveryService` | Annonces BLE et lecture GATT. Aucune écriture, aucun appairage automatique. |
| `DeviceRegistry` | Identifiants stables, déduplication, pièces et groupes. |
| `DeviceConnectionManager` | Trois tentatives (1 s, puis 2 s). Un protocole inconnu ou non confirmé sans capacité n’est pas sondé. |
| `DeviceCommandService` | Vérifie la capacité annoncée. Une simulation s’arrête avant l’adaptateur. |
| `DeviceStateManager` | Relit toutes les 30 s les appareils connectés, sauf simulation, Zigbee2MQTT, Matter et BLE. |
| `DeviceAdapterRegistry` | Résout l’adaptateur déclaré par l’appareil. |
| `ZigbeeGatewayService` | Session MQTT ou WebSocket Home Assistant, import, appairage Zigbee2MQTT, inventaire USB. |

## DeviceAdapter

Chaque adaptateur implémente `discover`, `identify`, `authenticate`, `connect`, `getCapabilities`, `getState`, `executeCommand` et `disconnect`.

| Adaptateur | Prise en charge réelle |
| --- | --- |
| `TPLinkAdapter` | Kasa UDP/TCP 9999. KP400 par `context.child_ids`. KLAP refusé. |
| `BelkinWemoAdapter` | SSDP, `setup.xml`, SCPD, SOAP `basicevent`. L’intensité seulement si l’argument existe. |
| `LevitonAdapter` | Classification par préfixe. Commande seulement après import de passerelle. |
| `StelproAdapter` | Identification des modèles Zigbee et Z-Wave publiés. Commande seulement via passerelle. |
| `MatterAdapter` | DNS-SD `_matter` et `_hap`. Pas de commissionnement. |
| `BluetoothAdapter` | Scan et lecture GATT. Statut incompatible après inspection. |
| `ZigbeeAdapter` | Délégation vers Zigbee2MQTT ou Home Assistant. |

`hardwareVerified` devient vrai après un échange réseau réussi : réponse Kasa ou WeMo, état Home Assistant disponible, publication MQTT acceptée, ou message d’état Zigbee2MQTT reçu. Le cache MQTT seul ne suffit pas. Ce drapeau ne veut pas dire que l’appareil a été essayé sur la table.

## Réseau

Le module Expo `home-network` (Kotlin) fournit le réseau actif, UDP, TCP, SSDP, mDNS, BLE et l’inventaire USB. Le transport JavaScript refuse toute cible qui n’est pas une adresse locale : IPv4 privé, boucle locale, lien local, IPv6 `::1`, `fe80`, `fc`/`fd`, ou nom `localhost`, à un seul label, `.local`, `.lan`, `.home`, `.internal`, `.home.arpa`.

Les découvertes peuvent viser `255.255.255.255` et la diffusion du sous-réseau privé. Le trafic HTTP clair est autorisé dans le manifeste parce que WeMo parle HTTP sur le LAN. Le code refuse quand même une cible publique.

## Persistance

SQLite (`maison.db`) contient les pièces, les groupes, les appareils, les appartenances, les passerelles et les préférences. La sélection d’appareil est une préférence, pour survivre au pliage et à une recréation d’activité.

Les jetons et mots de passe de passerelle vont dans `expo-secure-store`, sous la clé `gateway.<id>.secret`. La ligne de passerelle ne garde que `secretRef`.

## Écran pliable

`useFormFactor` considère l’écran élargi lorsque la largeur atteint 600 px. L’arbre de navigation n’est pas recréé selon la largeur. L’écran externe garde les onglets et une liste verticale. L’écran interne affiche un rail et, dans la liste, le contrôle de l’appareil choisi à droite.

## Zigbee

Mode A : Zigbee2MQTT ou Home Assistant déjà autorisé sur le LAN. TLS est proposé par défaut pour MQTT. Sans TLS, l’interface avertit que le secret circule en clair.

Mode B : `listUsbDevices` énumère les périphériques USB Host. Aucun protocole série ni coordonnateur n’est démarré. L’écran le dit explicitement.
