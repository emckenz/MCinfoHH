# Protocoles

Seules des commandes déjà publiées sont envoyées. Une absence de réponse n’est pas convertie en succès.

## Kasa, port 9999

Sources : le projet python-kasa, les notes softScheck et les captures housekasa.

Le JSON est chiffré par XOR, clé initiale `0xAB`, puis chaque octet clair est combiné avec le chiffré précédent. UDP envoie ce tampon. TCP le précède d’une longueur big-endian. La requête d’identité est `{"system":{"get_sysinfo":{}}}`.

Le vecteur connu de cette requête, une fois chiffré, commence par `d0f281f88bff9af7d5ef94b6`. La trame TCP ajoute `0000001d`.

Pour une prise à plusieurs sorties, l’identifiant de commande est `deviceId` suivi de l’index sur deux caractères, par exemple `ABC00`, dans `context.child_ids`. Une commande maître sans enfant n’est pas envoyée : elle basculerait toutes les sorties.

Le gradateur n’utilise `smartlife.iot.dimmer.set_brightness` que si `sysinfo.brightness` existe. L’ampoule n’utilise `transition_light_state` que si `light_state` existe. Un `err_code` non nul est un refus.

KLAP n’est pas implémenté. Si l’appareil ne répond pas au protocole historique, il reste hors ligne ou en authentification requise. Aucune commande KLAP n’est inventée.

## Belkin WeMo

Source : pywemo.

Recherche SSDP `M-SEARCH` vers `239.255.255.250:1900`, `MX: 2`, cibles WeMo puis `ssdp:all`, au plus 40 réponses. Ensuite un GET du `LOCATION` vers `setup.xml` seulement. L’ajout manuel interroge les ports documentés 49153, 49152, 49154, 49151 et 49155 à 49159, avec un délai court. Aucun autre port n’est sondé.

L’action SOAP est `urn:Belkin:service:basicevent:1`. `BinaryState` 1 est allumé, 0 éteint, 8 veille allumée. Insight prend le premier nombre avant `|`. L’argument `brightness` n’est envoyé que s’il figure dans le SCPD de `SetBinaryState`. Une valeur supérieure à 100 est lue comme une échelle 0–255.

Les appareils WeMo ne sont pas interchangeables : le type et les capacités viennent de `setup.xml` et du SCPD.

## Matter et HomeKit

Découverte DNS-SD `_matter._tcp.`, `_matterc._udp.` et `_hap._tcp.`. Les champs TXT `CM`, `D`, `VP`, `DN`, `DT` et `PH` sont lus. Le fabricant n’est affiché comme Leviton que si `DN` contient Leviton. Aucune commande de commissionnement n’existe dans l’application.

## Bluetooth

Scan BLE, puis lecture des services GATT accessibles. Pas d’écriture, pas d’appairage automatique. Un périphérique vu reste non commandable.

## Zigbee2MQTT

MQTT 3.1.1. Abonnement `base/#`. Les appareils viennent du message retenu `bridge/devices`. Les commandes sont publiées en JSON sur `base/<friendly_name>/set`, uniquement pour les `exposes` présents. L’appairage envoie `bridge/request/permit_join` avec `{"time":60}`.

Pour un thermostat Stelpro documenté : `occupied_heating_setpoint` de 5 à 30, `system_mode` `off` / `auto` / `heat`, `local_temperature`, `running_state` `idle` ou `heat`. L’intensité de l’interface, de 0 à 100, est ramenée au `value_max` de l’expose, 255 par défaut. La couleur n’est envoyée que si `color_hs` est exposé. Aucune conversion XY n’est inventée.

TLS est le réglage par défaut et les certificats sont vérifiés. MQTT en clair n’est permis que vers une adresse locale, avec un avertissement.

Les modèles cités par Zigbee2MQTT et utilisés pour l’identification sont SMT402, SMT402AD, STZB402, SORB et ST218. STZW402 est Z-Wave et n’est pas traité comme Zigbee. Certains SMT402 publient un identifiant Zigbee altéré ; l’application utilise le modèle que la passerelle annonce, sans tenter de le corriger sur la radio.

## Home Assistant

WebSocket local : `auth_required`, puis `auth` avec le jeton, puis `auth_ok`. Import par `config/device_registry/list`, `config/entity_registry/list` et `get_states`. Plateformes `zha`, `mqtt` et `zwave_js`. Domaines `switch`, `light` et `climate`. Lumière : `brightness_pct`. Thermostat : `set_temperature` et `set_hvac_mode`. Le jeton reste dans le stockage sécurisé.

## Leviton

Les préfixes viennent du guide d’application publié par Leviton.

| Préfixe | Lecture |
| --- | --- |
| D2, D3 | Wi-Fi, souvent Matter ou HomeKit. Commissionnement non implémenté. |
| DD | Bluetooth propriétaire. Pas de profil GATT implémenté. |
| DG | Zigbee, passerelle requise. |
| DH | HomeKit. Détection seulement. |
| DW | Première génération, nuage My Leviton. Non implémenté, car cela sortirait du LAN. |
| DZ, ZW | Z-Wave, passerelle requise. |
| DN | Wi-Fi de génération non déterminée. |

L’apparence Decora ne classe pas l’appareil. Le contrôle n’existe qu’après un import Home Assistant ou Zigbee2MQTT, et seulement pour les entités réellement publiées.

## Stelpro

Le thermostat mural blanc n’est pas supposé être un Maestro. Le convecteur Orléans n’est pas supposé avoir de Wi-Fi : la fiche produit décrit un thermostat Zigbee optionnel. Un modèle Wi-Fi sans API locale documentée est marqué incompatible. Aucune commande directe n’est envoyée avant l’import d’une passerelle autorisée.

## USB

Android USB Host peut lister un adaptateur branché en OTG : fabricant, produit, identifiants et classes. Le Fold 8 n’a pas de radio Zigbee. Aucun pilote de coordonnateur, aucun appairage et aucune clé de réseau ne sont implémentés. Cette voie reste expérimentale tant qu’elle n’a pas été validée sur le matériel.
