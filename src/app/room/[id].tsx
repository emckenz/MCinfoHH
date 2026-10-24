import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActionButton, Banner, Card, Muted, Title } from '../../components/primitives';
import { useHomeStore } from '../../store/homeStore';
import { usePalette } from '../../theme/useTheme';

export default function RoomScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const palette = usePalette();
  const room = useHomeStore((state) => state.rooms.find((item) => item.id === id));
  const devices = useHomeStore((state) => state.devices.filter((device) => device.roomId === id).sort((a, b) => a.sortOrder - b.sortOrder));
  const saveRoom = useHomeStore((state) => state.saveRoom);
  const deleteRoom = useHomeStore((state) => state.deleteRoom);
  const reorder = useHomeStore((state) => state.reorder);
  const executeMany = useHomeStore((state) => state.executeMany);
  const [name, setName] = useState(room?.name ?? '');
  const [report, setReport] = useState<string>();

  if (!room) return <Muted>Pièce introuvable.</Muted>;
  const move = (index: number, direction: -1 | 1) => {
    const ids = devices.map((device) => device.id);
    const target = index + direction;
    if (target < 0 || target >= ids.length) return;
    const [item] = ids.splice(index, 1);
    ids.splice(target, 0, item);
    void reorder(ids);
  };

  return (
    <ScrollView style={{ backgroundColor: palette.bg }} contentContainerStyle={[styles.content, { paddingTop: insets.top + 12 }]}>
      <ActionButton label="Retour" onPress={() => router.back()} />
      <Title>{room.name}</Title>
      <TextInput value={name} onChangeText={setName} onEndEditing={() => void saveRoom({ ...room, name: name.trim() || room.name })} style={[styles.input, { color: palette.ink, borderColor: palette.line }]} />
      {devices.map((device, index) => (
        <Card key={device.id}>
          <Text style={{ color: palette.ink, fontSize: 17, fontWeight: '700' }} onPress={() => router.push(`/device/${device.id}`)}>{device.name}</Text>
          <View style={styles.row}>
            <ActionButton label="Monter" onPress={() => move(index, -1)} />
            <ActionButton label="Descendre" onPress={() => move(index, 1)} />
          </View>
        </Card>
      ))}
      <ActionButton label="Éteindre ce qui est commandable" onPress={() => void executeMany(devices.map((device) => device.id), { type: 'setOnOff', on: false }).then((results) => {
        const failed = results.filter((result) => !result.ok);
        setReport(failed.length === 0 ? 'Commandes terminées.' : `${results.length - failed.length} réussies, ${failed.length} non exécutées.`);
      })} />
      {report ? <Banner>{report}</Banner> : null}
      <ActionButton label="Supprimer la pièce" onPress={() => void deleteRoom(room.id).then(() => router.back())} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, gap: 12 },
  input: { minHeight: 48, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12 },
  row: { flexDirection: 'row', gap: 8 },
});
