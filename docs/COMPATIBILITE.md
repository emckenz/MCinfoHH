# Matrice de compatibilité

Source affichée dans les réglages : `src/domain/supportMatrix.ts`.

Aucun essai physique n’a été fait sur le KP400, les interrupteurs Belkin, les Decora Leviton, le thermostat Stelpro ni le convecteur Orléans. La colonne matériel reste `not-run`.

| Appareil | Protocole réellement utilisé | Niveau | Matériel |
| --- | --- | --- | --- |
| TP-Link KP400 et Kasa historique, port 9999 | UDP/TCP 9999, JSON chiffré XOR 0xAB | Implémenté, non vérifié chez vous | Non exécuté |
| Belkin WeMo | SSDP, setup.xml, SOAP basicevent | Implémenté, non vérifié chez vous | Non exécuté |
| Leviton Decora | Classification par préfixe publié. Pas d’API locale unique. | Identification seulement | Non exécuté |
| Stelpro Maestro et Orléans | Zigbee via Zigbee2MQTT pour les modèles documentés. Pas de Wi-Fi direct pour l’Orléans. | Commande seulement après import de passerelle | Non exécuté |
| Matter | DNS-SD `_matter._tcp` et `_matterc._udp` | Découverte seulement | Non exécuté |
| Bluetooth Low Energy | Annonces et lecture GATT | Découverte seulement | Non exécuté |
| Zigbee2MQTT | MQTT 3.1.1, sujets `zigbee2mqtt/<nom>/set` et `bridge/devices` | Implémenté, non vérifié chez vous | Non exécuté |
| Home Assistant ZHA, MQTT, Z-Wave JS | WebSocket local | Implémenté, non vérifié chez vous | Non exécuté |
| Adaptateur Zigbee USB-C | Inventaire USB Host | Expérimental, non fonctionnel | Non exécuté |

## Lecture des statuts

- Détecté : vu, pas encore classé comme commandable.
- Compatible : un protocole documenté annonce des commandes.
- Authentification requise : il manque un secret, un commissionnement ou une passerelle.
- Connecté : la session ou la dernière lecture a réussi.
- Non compatible : aucun protocole local implémenté.
- Hors ligne : plus de réponse, ou état Home Assistant indisponible.

La découverte ne garantit pas le contrôle. Deux appareils WeMo ne sont pas traités comme identiques : les capacités viennent du SCPD. Un Decora n’est pas supposé connecté d’après son apparence. Un convecteur Orléans n’est pas supposé joignable en Wi-Fi.
