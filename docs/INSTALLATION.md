# Installation

## Prérequis

- Node.js 22
- Un development build Android. Expo Go ne charge pas le module `home-network`.
- JDK 21 pour compiler l’APK
- Android SDK, les build-tools et le NDK demandés par le projet généré

## Vérifier le code

```bash
npm install
npm test
npm run typecheck
```

`npm test` exécute les tests de protocole, de découverte, de déduplication, de filtres, de groupes, de persistance SQLite, d’adaptateurs, d’erreurs, de commandes et de reconnexion. Ils n’ouvrent aucune prise vers la maison.

## Interface dans le navigateur

```bash
npm run web
```

Ouvrir http://127.0.0.1:8081. `metro.config.js` laisse Metro empaqueter le WebAssembly de SQLite. Le script `scripts/dev-web.mjs` ajoute `Cross-Origin-Opener-Policy` et `Cross-Origin-Embedder-Policy` sur le document, ce que le serveur de développement d’Expo SDK 58 n’applique pas à la page d’accueil. Sans ces en-têtes, `SharedArrayBuffer` est absent et la base ne s’ouvre pas. `npx expo start --web` seul ne suffit donc pas pour le navigateur.

Le mode démonstration, dans Réglages, ajoute des appareils nommés « Simulation — ». Ils restent locaux. Dans le navigateur, cette maison est gardée en mémoire pour la session : le fichier SQLite du navigateur ne supporte qu’un seul accès et fermait l’onglet. La recherche Wi-Fi, Bluetooth, Matter et USB affiche une erreur explicite en haut de l’écran : ces fonctions existent dans le development build Android.

Les secrets saisis dans le navigateur ne sont pas écrits sur le disque.

## Development build

```bash
npx expo prebuild --platform android
npx expo run:android
```

`prebuild` crée `android/`, ignoré par Git. Le paquet est `com.mcinfohh.maison`.

Permissions demandées : Internet, état du réseau, état Wi-Fi, multicast, localisation fine, appareils Wi-Fi proches, Bluetooth scan et connexion. `NEARBY_WIFI_DEVICES` et `BLUETOOTH_SCAN` sont déclarés `neverForLocation` dans le module natif. La localisation peut rester nécessaire pour lire le SSID selon la version d’Android. Si le SSID est inconnu, l’application le dit au lieu d’inventer le nom du réseau.

Le téléphone et les appareils en 2,4 GHz doivent pouvoir se parler à travers le routeur. Un téléphone en 5 GHz n’a pas besoin d’être sur la même bande.

## APK de développement

Le dépôt SDK actuel publie `platforms;android-37.0`, pas `platforms;android-37`. React Native 0.88 demande compileSdk 37, build-tools 37.0.0 et le NDK 27.1.12297006. Si Gradle ne trouve pas la plateforme, créez le lien `platforms/android-37` vers `platforms/android-37.0`.

```bash
export ANDROID_HOME="$HOME/android-sdk"
printf 'sdk.dir=%s\n' "$ANDROID_HOME" > android/local.properties
cd android
./gradlew assembleDebug -PreactNativeArchitectures=arm64-v8a
```

`arm64-v8a` correspond au Galaxy Z Fold. L’APK sort dans `android/app/build/outputs/apk/debug/app-debug.apk`.

Une compilation locale a réussi le 24 octobre 2026 à 10 h 42, heure de Toronto. Le binaire pèse environ 90 Mo. Le dossier `android/` reste ignoré par Git : il est régénéré par prebuild.

## APK depuis GitHub Actions

Le workflow `.github/workflows/android-apk.yml` compile le même APK de débogage, limité à `arm64-v8a`, l’architecture du Galaxy Z Fold. Il part à chaque poussée sur `main` ou sur une branche `cursor/…`, et peut être relancé à la main dans l’onglet Actions, workflow « APK Android ». Une poussée qui ne touche que `apk/` ne relance pas la compilation.

À la fin d’une exécution réussie, le workflow commit le fichier dans la même branche :

- `apk/maison-fold-debug.apk`
- `apk/maison-fold-debug.sha256`

Sur le poste, `git pull` récupère cet APK. Le copier sur le téléphone, autoriser l’installation depuis cette provenance, puis l’ouvrir. Le paquet est `com.mcinfohh.maison`. L’empreinte SHA-256 du fichier est dans `apk/maison-fold-debug.sha256`.

L’artefact Actions `maison-fold-debug` reste publié en plus, pour trente jours. Le binaire fait environ 90 Mo, sous la limite GitHub de 100 Mo. Chaque publication nouvelle reste dans l’historique Git.

Sans le secret `MAISON_KEYSTORE_BASE64`, chaque exécution signe l’APK avec une clé de débogage nouvelle. Android refuse alors d’écraser l’installation précédente : il faut désinstaller Maison, puis installer le nouvel APK. Les données locales de l’application partent avec la désinstallation.

Pour garder la même signature et mettre à jour sans désinstaller, créer une fois un magasin de clés de débogage et le déposer dans les secrets du dépôt :

```bash
keytool -genkeypair -keystore maison-debug.keystore -alias androiddebugkey \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -storepass android -keypass android \
  -dname "CN=Maison, OU=Maison, O=Maison, L=Montreal, ST=Quebec, C=CA"
base64 -w0 maison-debug.keystore
```

Le secret s’appelle `MAISON_KEYSTORE_BASE64`. Le mot de passe et l’alias doivent rester `android` et `androiddebugkey` : ce sont ceux que Gradle utilise pour une compilation de débogage. Ne pas committer le fichier `.keystore`.

## Passerelles

Zigbee2MQTT : adresse locale, port 8883 et TLS par défaut. Le mot de passe est stocké dans le coffre Android. Sans TLS, l’écran avertit que le secret circule en clair sur le LAN. L’import attend le message retenu `bridge/devices`.

Home Assistant : WebSocket local `ws://` ou `wss://` sur le port habituel 8123, chemin `/api/websocket`. Le jeton d’accès longue durée n’est pas enregistré dans SQLite.

L’inspection USB ne fait que lister les périphériques. Elle ne démarre pas de réseau Zigbee.

## Limites connues

- KLAP, Matter, HomeKit, My Leviton et le Bluetooth propriétaire ne commandent rien.
- Un Leviton ou un Stelpro ajouté par modèle reste en identification tant qu’une passerelle ne le publie pas.
- Les tests automatiques couvrent les trames et les refus. Ils ne remplacent pas un essai sur le KP400, les WeMo, les Decora et les Stelpro de la maison.
