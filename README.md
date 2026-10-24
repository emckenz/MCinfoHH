# Maison

Application Android de domotique locale pour un Samsung Galaxy Z Fold 8. Elle découvre et organise les appareils de la maison, puis ne les commande que lorsqu’un protocole documenté le permet.

Le mode démonstration est éteint par défaut. Les appareils simulés portent le préfixe « Simulation — » et n’envoient aucune commande réseau.

Aucun appareil de la maison n’a été testé physiquement. La matrice de compatibilité indique `hardwareTest: not-run` pour chaque entrée. Un échange réseau réussi depuis l’installation ne remplace pas cet essai.

## Ce qui est utilisable

- Interface claire et sombre, navigation basse sur écran étroit, rail et deux colonnes à partir de 600 px.
- Inventaire local SQLite : appareils, pièces, groupes, favoris, préférences.
- Secrets de passerelle dans le stockage chiffré Android. Jamais en clair dans SQLite. En navigateur, ils restent en mémoire le temps de la session.
- Découverte Kasa (UDP 9999), SSDP WeMo, DNS-SD Matter et HomeKit, Bluetooth en lecture seule, ajout manuel par IP.
- Commande locale Kasa historique et SOAP WeMo, d’après les services réellement annoncés.
- Import Zigbee2MQTT (MQTT 3.1.1, TLS par défaut) et Home Assistant local (ZHA, MQTT, Z-Wave JS) pour interrupteurs, lumières et thermostats, dont Stelpro lorsque la passerelle les publie.

## Ce qui n’est pas fonctionnel

- KLAP TP-Link, le nuage My Leviton, le commissionnement Matter et HomeKit, l’écriture GATT.
- Un Leviton ou un Stelpro identifié seulement par son modèle : aucune commande directe.
- L’adaptateur USB : inventaire USB Host seulement. Pas de coordonnateur Zigbee.

## Démarrage

Les modules natifs exigent un development build. Expo Go ne suffit pas.

```bash
npm install
npm test
npm run typecheck
npx expo start --dev-client
```

Le navigateur sert à parcourir l’interface et le mode démonstration. La découverte Wi-Fi, Bluetooth et USB y est refusée explicitement.

L’installation Android, les permissions et la compilation de l’APK sont décrites dans [docs/INSTALLATION.md](docs/INSTALLATION.md). L’architecture est dans [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
