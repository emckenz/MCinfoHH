import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActionButton, Banner, Card, Muted, Title } from '../../components/primitives';
import { hasPowerControl, isPoweredOn } from '../../domain/filter';
import { useHomeStore } from '../../store/homeStore';
import { usePalette } from '../../theme/useTheme';

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const palette = usePalette();
  const devices = useHomeStore((state) => state.devices);
  const rooms = useHomeStore((state) => state.rooms);
  const demoMode = useHomeStore((state) => state.demoMode);
  const executeMany = useHomeStore((state) => state.executeMany);
  const bootError = useHomeStore((state) => state.bootError);
  const scanWifi = useHomeStore((state) => state.scanWifi);
  const discovering = useHomeStore((state) => state.discovering);
  const discoveryError = useHomeStore((state) => state.discoveryError);
  const recognitionNote = useHomeStore((state) => state.recognitionNote);
  const lights = devices.filter((device) => ['light', 'dimmer', 'switch'].includes(device.type) && isPoweredOn(device));
  const temperatures = devices.filter((device) => device.currentState.currentTemperatureC !== undefined);
  const favorites = devices.filter((device) => device.isFavorite);
  const connected = devices.filter((device) => device.connectionStatus === 'connected');

  return (
    <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 24 }]}>
      <Muted>Maison</Muted>
      <Title>La maison, sur ce téléphone.</Title>
      <Banner tone="info">La liste reste dans la mémoire du téléphone. Aucun serveur n’est nécessaire : sur le même Wi-Fi, Maison cherche les prises et les interrupteurs, les reconnaît et les garde.</Banner>
      {demoMode ? <Banner tone="sim">Mode démonstration. Les appareils marqués Simulation ne parlent à aucun réseau.</Banner> : null}
      {bootError ? <Banner tone="danger">{bootError}</Banner> : null}
      {discoveryError ? <Banner tone="danger">{discoveryError}</Banner> : null}
      {recognitionNote ? <Banner tone="info">{recognitionNote}</Banner> : null}
      <ActionButton label={discovering ? 'Recherche sur le Wi-Fi…' : 'Chercher sur ce Wi-Fi'} emphasis disabled={discovering} onPress={() => void scanWifi()} />
      <View style={styles.stats}>
        <Stat label="Appareils" value={String(devices.length)} />
        <Stat label="Connectés" value={String(connected.length)} />
        <Stat label="Lumières allumées" value={String(lights.length)} />
        <Stat label="Températures" value={String(temperatures.length)} />
      </View>
      <Card>
        <Text style={[styles.section, { color: palette.ink }]}>Favoris</Text>
        {favorites.length === 0 ? <Muted>Aucun favori pour le moment.</Muted> : favorites.map((device) => (
          <Text key={device.id} onPress={() => router.push(`/device/${device.id}`)} style={{ color: palette.accent, fontSize: 16, paddingVertical: 6 }}>{device.name}</Text>
        ))}
      </Card>
      <Card>
        <Text style={[styles.section, { color: palette.ink }]}>Pièces</Text>
        {rooms.length === 0 ? <Muted>Créez une pièce pour ranger les appareils.</Muted> : rooms.map((room) => (
          <Text key={room.id} onPress={() => router.push(`/room/${room.id}`)} style={{ color: palette.ink, fontSize: 16, paddingVertical: 6 }}>{room.name}</Text>
        ))}
      </Card>
      {temperatures.map((device) => (
        <Card key={device.id} onPress={() => router.push(`/device/${device.id}`)}>
          <Text style={[styles.section, { color: palette.ink }]}>{device.name}</Text>
          <Text style={{ color: palette.ink, fontSize: 28, fontWeight: '700' }}>{device.currentState.currentTemperatureC?.toFixed(1)} °C</Text>
          <Muted>Consigne {device.currentState.targetTemperatureC?.toFixed(1) ?? '—'} °C · {device.currentState.heating ? 'chauffe' : 'repos'}</Muted>
        </Card>
      ))}
      <ActionButton
        label="Éteindre les lumières commandables"
        emphasis
        disabled={lights.filter((device) => device.simulated || device.connectionStatus === 'connected').length === 0}
        onPress={() => {
          const targets = lights.filter((device) => (device.simulated || device.connectionStatus === 'connected') && hasPowerControl(device));
          void executeMany(targets.map((device) => device.id), { type: 'setOnOff', on: false });
        }}
      />
    </ScrollView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  const palette = usePalette();
  return (
    <View style={[styles.stat, { backgroundColor: palette.raised, borderColor: palette.line }]}>
      <Text style={{ color: palette.ink, fontSize: 28, fontWeight: '700' }}>{value}</Text>
      <Text style={{ color: palette.soft, fontSize: 13 }}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, gap: 14 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  stat: { width: '47%', flexGrow: 1, borderWidth: 1, borderRadius: 18, padding: 14, gap: 4 },
  section: { fontSize: 18, fontWeight: '700' },
});
