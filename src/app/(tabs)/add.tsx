import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActionButton, Banner, Card, Muted, StatusPill, Title } from '../../components/primitives';
import { findDuplicate } from '../../domain/dedupe';
import { TYPE_LABEL } from '../../domain/types';
import { DiscoveryScope } from '../../services/DeviceDiscoveryService';
import { useHomeStore } from '../../store/homeStore';
import { usePalette } from '../../theme/useTheme';

const OPTIONS: Array<{ scope: DiscoveryScope; title: string; detail: string }> = [
  { scope: 'wifi', title: 'Wi-Fi de ce téléphone', detail: 'Kasa et WeMo sont enregistrés sur le téléphone dès qu’ils répondent. Matter et HomeKit sont reconnus, sans commissionnement.' },
  { scope: 'auto', title: 'Wi-Fi et Bluetooth', detail: 'Ajoute les annonces Bluetooth. Un périphérique vu n’est pas contrôlable pour autant.' },
  { scope: 'bluetooth', title: 'Bluetooth', detail: 'Annonces BLE. Un périphérique vu n’est pas contrôlable.' },
  { scope: 'matter', title: 'Matter', detail: 'Détection seulement. Aucun commissionnement.' },
];

export default function AddScreen() {
  const insets = useSafeAreaInsets();
  const palette = usePalette();
  const discover = useHomeStore((state) => state.discover);
  const discovering = useHomeStore((state) => state.discovering);
  const discovery = useHomeStore((state) => state.discovery);
  const discoveryError = useHomeStore((state) => state.discoveryError);
  const addHit = useHomeStore((state) => state.addHit);
  const devices = useHomeStore((state) => state.devices);
  const gateways = useHomeStore((state) => state.gateways);
  const recognitionNote = useHomeStore((state) => state.recognitionNote);
  const [showGateway, setShowGateway] = useState(false);
  const [ipAddress, setIpAddress] = useState('');
  const [model, setModel] = useState('');
  const [added, setAdded] = useState<string>();

  return (
    <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 28 }]}>
      <Title>Ajouter un appareil</Title>
      <Muted>Le téléphone cherche sur le Wi-Fi auquel il est connecté et garde la liste dans sa mémoire.</Muted>
      <Banner tone="info">Un téléphone en Wi-Fi 5 GHz peut joindre un appareil en 2,4 GHz lorsque le routeur relie les deux bandes. La découverte ne prouve pas que l’appareil soit commandable.</Banner>
      {recognitionNote ? <Banner tone="info">{recognitionNote}</Banner> : null}
      {discoveryError ? <Banner tone="danger">{discoveryError}</Banner> : null}
      {OPTIONS.map((option) => (
        <Card key={option.scope}>
          <Text style={[styles.heading, { color: palette.ink }]}>{option.title}</Text>
          <Muted>{option.detail}</Muted>
          <ActionButton label={discovering ? 'Recherche…' : 'Lancer'} disabled={discovering} onPress={() => void discover(option.scope)} />
        </Card>
      ))}
      <Card>
        <Text style={[styles.heading, { color: palette.ink }]}>Zigbee, seulement avec un pont déjà chez vous</Text>
        <Muted>Le téléphone n’a pas de radio Zigbee. Ce pont, s’il est déjà allumé sur le réseau local, n’est pas un serveur à joindre depuis Internet. Le Wi-Fi n’en a pas besoin.</Muted>
        <ActionButton label={showGateway ? 'Masquer le pont' : 'Afficher le pont local'} onPress={() => setShowGateway((value) => !value)} />
        {showGateway ? (
          <View style={{ gap: 8 }}>
            {gateways.map((gateway) => (
              <ActionButton key={gateway.id} label={`Importer ${gateway.name}`} onPress={() => void discover('gateway', { gatewayId: gateway.id })} />
            ))}
            {gateways.length === 0 ? <Muted>Aucun pont enregistré. L’ajout se fait dans les réglages, et reste facultatif.</Muted> : null}
          </View>
        ) : null}
      </Card>
      <Card>
        <Text style={[styles.heading, { color: palette.ink }]}>Ajout manuel</Text>
        <TextInput value={ipAddress} onChangeText={setIpAddress} placeholder="Adresse IP locale" placeholderTextColor={palette.soft} autoCapitalize="none" style={[styles.input, { color: palette.ink, borderColor: palette.line }]} />
        <TextInput value={model} onChangeText={setModel} placeholder="Modèle, par exemple KP400, DW6HD, SMT402" placeholderTextColor={palette.soft} autoCapitalize="characters" style={[styles.input, { color: palette.ink, borderColor: palette.line }]} />
        <ActionButton label="Identifier" onPress={() => void discover('manual', { ipAddress: ipAddress.trim(), model: model.trim() })} />
      </Card>
      {added ? <Banner tone="info">{added}</Banner> : null}
      {discovery.map((hit) => (
        <Card key={hit.id}>
          <View style={styles.row}>
            <Text style={[styles.heading, { color: palette.ink, flex: 1 }]}>{hit.name}</Text>
            <StatusPill status={hit.connectionStatus} />
          </View>
          <Muted>{hit.manufacturer} · {hit.model} · {TYPE_LABEL[hit.type]}</Muted>
          <Muted>{hit.compatibilityNote}</Muted>
          {findDuplicate(devices, [hit.id, ...hit.dedupeKeys]) ? (
            <Muted>Déjà dans la liste du téléphone.</Muted>
          ) : (
            <ActionButton label="Ajouter à la maison" onPress={() => void addHit(hit).then(() => setAdded(`${hit.name} ajouté.`))} />
          )}
        </Card>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, gap: 12 },
  heading: { fontSize: 18, fontWeight: '700' },
  input: { minHeight: 48, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12 },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
});
