# Arborescence

```
src/app
  _layout.tsx              racine, rail sur grand écran
  (tabs)/                  accueil, appareils, pièces, ajout, réglages
  device/[id].tsx          contrôle
  room/[id].tsx            pièce, ordre, commande groupée
  group/[id].tsx           groupe
src/components             contrôles, primitives, rail
src/data                   schéma SQLite, dépôt, secrets
src/demo                   appareils simulés, nommés comme tels
src/domain                 types, déduplication, filtres, adresses locales, matrice
src/protocol               Kasa, WeMo, Matter, MQTT, Zigbee2MQTT, Home Assistant, identification
src/services               services du cahier des charges et adaptateurs
src/store/homeStore.ts     état Zustand
src/theme                  clair et sombre
src/transport              transport Android et repli navigateur
src/ui/useFormFactor.ts    largeur, orientation, écran externe
modules/home-network       module Expo Kotlin
tests                      protocoles, découverte, commandes, persistance
docs                       architecture, protocoles, compatibilité, installation
```

Les dossiers `android/` et `ios/` sont générés par `expo prebuild` et ignorés par Git. Le code natif maintenu est dans `modules/home-network`.
