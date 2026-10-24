import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActionButton, Banner, Card, Muted, StatusPill, Title } from '../../components/primitives';
import { TYPE_LABEL } from '../../domain/types';
import { DiscoveryScope } from '../../services/DeviceDiscoveryService';
import { useHomeStore } from '../../store/homeStore';
import { usePalette } from '../../theme/useTheme';

const OPTIONS: Array<{ scope: DiscoveryScope; title: string; detail: string }> = [
  { scope: 'auto', title: 'Recherche automatique', detail: 'Kasa, WeMo, Matter, HomeKit et Bluetooth. Pas de balayage de ports.' },
  { scope: 'wifi', title: 'Wi-Fi', detail: 'Diffusion Kasa, SSDP WeMo et DNS-SD.' },
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
  const gateways = useHomeStore((state) => state.gateways);
  const [ipAddress, setIpAddress] = useState('');
  const [model, setModel] = useState('');
  const [added, setAdded] = useState<string>();

  return (
    <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 28 }]}>
      <Title>Ajouter un appareil</Title>
      <Muted>Les résultats apparaissent au fil de la recherche. Un appareil détecté peut rester non commandable.</Muted>
      <Banner tone="info">Un téléphone en Wi-Fi 5 GHz peut joindre un appareil en 2,4 GHz lorsque le routeur relie les deux bandes. La découverte ne prouve pas que l’appareil soit commandable.</Banner>
      {OPTIONS.map((option) => (
        <Card key={option.scope}>
          <Text style={[styles.heading, { color: palette.ink }]}>{option.title}</Text>
          <Muted>{option.detail}</Muted>
          <ActionButton label={discovering ? 'Recherche…' : 'Lancer'} disabled={discovering} onPress={() => void discover(option.scope)} />
        </Card>
      ))}
      <Card>
        <Text style={[styles.heading, { color: palette.ink }]}>Passerelle Zigbee</Text>
        <Muted>Zigbee2MQTT ou Home Assistant doit déjà être connecté dans les réglages.</Muted>
        {gateways.map((gateway) => (
          <ActionButton key={gateway.id} label={`Importer ${gateway.name}`} onPress={() => void discover('gateway', { gatewayId: gateway.id })} />
        ))}
        {gateways.length === 0 ? <Muted>Aucune passerelle enregistrée.</Muted> : null}
      </Card>
      <Card>
        <Text style={[styles.heading, { color: palette.ink }]}>Ajout manuel</Text>
        <TextInput value={ipAddress} onChangeText={setIpAddress} placeholder="Adresse IP locale" placeholderTextColor={palette.soft} autoCapitalize="none" style={[styles.input, { color: palette.ink, borderColor: palette.line }]} />
        <TextInput value={model} onChangeText={setModel} placeholder="Modèle, par exemple KP400, DW6HD, SMT402" placeholderTextColor={palette.soft} autoCapitalize="characters" style={[styles.input, { color: palette.ink, borderColor: palette.line }]} />
        <ActionButton label="Identifier" onPress={() => void discover('manual', { ipAddress: ipAddress.trim(), model: model.trim() })} />
      </Card>
      {discoveryError ? <Banner tone="danger">{discoveryError}</Banner> : null}
      {added ? <Banner tone="info">{added}</Banner> : null}
      {discovery.map((hit) => (
        <Card key={hit.id}>
          <View style={styles.row}>
            <Text style={[styles.heading, { color: palette.ink, flex: 1 }]}>{hit.name}</Text>
            <StatusPill status={hit.connectionStatus} />
          </View>
          <Muted>{hit.manufacturer} · {hit.model} · {TYPE_LABEL[hit.type]}</Muted>
          <Muted>{hit.compatibilityNote}</Muted>
          <ActionButton label="Ajouter à la maison" onPress={() => void addHit(hit).then(() => setAdded(`${hit.name} ajouté.`))} />
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
