import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActionButton, Banner, Card, Muted, Title } from '../../components/primitives';
import { useHomeStore } from '../../store/homeStore';
import { usePalette } from '../../theme/useTheme';

export default function GroupScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const palette = usePalette();
  const group = useHomeStore((state) => state.groups.find((item) => item.id === id));
  const devices = useHomeStore((state) => state.devices.filter((device) => device.groupIds.includes(String(id))));
  const saveGroup = useHomeStore((state) => state.saveGroup);
  const deleteGroup = useHomeStore((state) => state.deleteGroup);
  const executeMany = useHomeStore((state) => state.executeMany);
  const [name, setName] = useState(group?.name ?? '');
  const [report, setReport] = useState<string>();
  if (!group) return <Muted>Groupe introuvable.</Muted>;

  return (
    <ScrollView style={{ backgroundColor: palette.bg }} contentContainerStyle={[styles.content, { paddingTop: insets.top + 12 }]}>
      <ActionButton label="Retour" onPress={() => router.back()} />
      <Title>{group.name}</Title>
      <TextInput value={name} onChangeText={setName} onEndEditing={() => void saveGroup({ ...group, name: name.trim() || group.name })} style={[styles.input, { color: palette.ink, borderColor: palette.line }]} />
      {devices.map((device) => (
        <Card key={device.id} onPress={() => router.push(`/device/${device.id}`)}>
          <Text style={{ color: palette.ink, fontWeight: '700' }}>{device.name}</Text>
          {device.simulated ? <Muted>Simulation</Muted> : null}
        </Card>
      ))}
      <ActionButton label="Allumer le groupe" onPress={() => void executeMany(devices.map((device) => device.id), { type: 'setOnOff', on: true }).then(summarize(setReport))} />
      <ActionButton label="Éteindre le groupe" onPress={() => void executeMany(devices.map((device) => device.id), { type: 'setOnOff', on: false }).then(summarize(setReport))} />
      {report ? <Banner>{report}</Banner> : null}
      <Muted>Les appareils sans marche/arrêt restent inchangés et sont signalés.</Muted>
      <ActionButton label="Supprimer le groupe" onPress={() => void deleteGroup(group.id).then(() => router.back())} />
    </ScrollView>
  );
}

function summarize(setReport: (value: string) => void) {
  return (results: Array<{ ok: boolean; error?: string }>) => {
    const failed = results.filter((result) => !result.ok);
    setReport(`${results.length - failed.length} réussies, ${failed.length} non exécutées.`);
  };
}

const styles = StyleSheet.create({
  content: { padding: 20, gap: 12 },
  input: { minHeight: 48, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12 },
});
