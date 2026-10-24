import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActionButton, Banner, Card, Muted, Title } from '../../components/primitives';
import { errorMessage } from '../../domain/errors';
import { useHomeStore } from '../../store/homeStore';
import { usePalette } from '../../theme/useTheme';

export default function RoomsScreen() {
  const insets = useSafeAreaInsets();
  const palette = usePalette();
  const rooms = useHomeStore((state) => state.rooms);
  const groups = useHomeStore((state) => state.groups);
  const devices = useHomeStore((state) => state.devices);
  const saveRoom = useHomeStore((state) => state.saveRoom);
  const saveGroup = useHomeStore((state) => state.saveGroup);
  const [roomName, setRoomName] = useState('');
  const [groupName, setGroupName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  const create = async (kind: 'room' | 'group') => {
    const name = (kind === 'room' ? roomName : groupName).trim();
    if (!name || saving) return;
    setSaving(true);
    setError(undefined);
    try {
      if (kind === 'room') {
        await saveRoom({ id: `room-${Math.random().toString(36).slice(2, 10)}`, name, icon: 'home', sortOrder: rooms.length });
        setRoomName('');
      } else {
        await saveGroup({ id: `group-${Math.random().toString(36).slice(2, 10)}`, name, deviceIds: [], sortOrder: groups.length });
        setGroupName('');
      }
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 28 }]}>
      <Title>Pièces et groupes</Title>
      <Muted>Un appareil a une pièce et peut appartenir à plusieurs groupes.</Muted>
      {error ? <Banner tone="danger">{error}</Banner> : null}
      <Card>
        <TextInput value={roomName} onChangeText={setRoomName} placeholder="Nouvelle pièce" placeholderTextColor={palette.soft} style={[styles.input, { color: palette.ink, borderColor: palette.line }]} />
        <ActionButton label={saving ? 'Création…' : 'Créer la pièce'} emphasis disabled={!roomName.trim() || saving} onPress={() => void create('room')} />
      </Card>
      {rooms.map((room) => (
        <Card key={room.id} onPress={() => router.push(`/room/${room.id}`)}>
          <Text style={[styles.heading, { color: palette.ink }]}>{room.name}</Text>
          <Muted>{devices.filter((device) => device.roomId === room.id).length} appareil(s)</Muted>
        </Card>
      ))}
      <Card>
        <TextInput value={groupName} onChangeText={setGroupName} placeholder="Nouveau groupe" placeholderTextColor={palette.soft} style={[styles.input, { color: palette.ink, borderColor: palette.line }]} />
        <ActionButton label={saving ? 'Création…' : 'Créer le groupe'} disabled={!groupName.trim() || saving} onPress={() => void create('group')} />
      </Card>
      {groups.map((group) => (
        <Card key={group.id} onPress={() => router.push(`/group/${group.id}`)}>
          <Text style={[styles.heading, { color: palette.ink }]}>{group.name}</Text>
          <Muted>{group.deviceIds.length} appareil(s)</Muted>
        </Card>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, gap: 12 },
  heading: { fontSize: 18, fontWeight: '700' },
  input: { minHeight: 48, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12 },
});
