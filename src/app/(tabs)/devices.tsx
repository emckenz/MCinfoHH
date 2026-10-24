import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DeviceControls } from '../../components/DeviceControls';
import { Muted, StatusPill, Title } from '../../components/primitives';
import { EMPTY_FILTERS, filterDevices, isPoweredOn } from '../../domain/filter';
import { DeviceFilters } from '../../domain/filter';
import { TYPE_LABEL, DeviceType } from '../../domain/types';
import { useHomeStore } from '../../store/homeStore';
import { usePalette } from '../../theme/useTheme';
import { useFormFactor } from '../../ui/useFormFactor';

const TYPES: DeviceType[] = ['plug', 'switch', 'dimmer', 'light', 'thermostat', 'convector'];

export default function DevicesScreen() {
  const insets = useSafeAreaInsets();
  const palette = usePalette();
  const { expanded } = useFormFactor();
  const devices = useHomeStore((state) => state.devices);
  const rooms = useHomeStore((state) => state.rooms);
  const groups = useHomeStore((state) => state.groups);
  const selected = useHomeStore((state) => state.selectedDeviceId);
  const select = useHomeStore((state) => state.selectDevice);
  const [filters, setFilters] = useState<DeviceFilters>(EMPTY_FILTERS);
  const roomNames = Object.fromEntries(rooms.map((room) => [room.id, room.name]));
  const visible = useMemo(() => filterDevices(devices, filters, roomNames), [devices, filters, roomNames]);
  const manufacturers = Array.from(new Set(devices.map((device) => device.manufacturer)));

  const list = (
    <FlatList
      data={visible}
      keyExtractor={(item) => item.id}
      contentContainerStyle={{ padding: 20, paddingTop: insets.top + 16, gap: 10, paddingBottom: 32 }}
      ListHeaderComponent={
        <View style={{ gap: 12, marginBottom: 8 }}>
          <Title>Appareils</Title>
          <TextInput
            value={filters.query}
            onChangeText={(query) => setFilters({ ...filters, query })}
            placeholder="Rechercher"
            placeholderTextColor={palette.soft}
            style={[styles.search, { color: palette.ink, borderColor: palette.line, backgroundColor: palette.raised }]}
          />
          <View style={styles.wrap}>
            {TYPES.map((type) => (
              <FilterChip key={type} label={TYPE_LABEL[type]} active={filters.types.includes(type)} onPress={() => toggle(filters, 'types', type, setFilters)} />
            ))}
            {manufacturers.map((manufacturer) => (
              <FilterChip key={manufacturer} label={manufacturer} active={filters.manufacturers.includes(manufacturer)} onPress={() => toggle(filters, 'manufacturers', manufacturer, setFilters)} />
            ))}
            {rooms.map((room) => (
              <FilterChip key={room.id} label={room.name} active={filters.roomIds.includes(room.id)} onPress={() => toggle(filters, 'roomIds', room.id, setFilters)} />
            ))}
            {groups.map((group) => (
              <FilterChip key={group.id} label={group.name} active={filters.groupIds.includes(group.id)} onPress={() => toggle(filters, 'groupIds', group.id, setFilters)} />
            ))}
            <FilterChip label="Connectés" active={filters.connection === 'connected'} onPress={() => setFilters({ ...filters, connection: filters.connection === 'connected' ? 'all' : 'connected' })} />
            <FilterChip label="Hors ligne" active={filters.connection === 'offline'} onPress={() => setFilters({ ...filters, connection: filters.connection === 'offline' ? 'all' : 'offline' })} />
            <FilterChip label="Allumés" active={filters.power === 'on'} onPress={() => setFilters({ ...filters, power: filters.power === 'on' ? 'all' : 'on' })} />
            <FilterChip label="Éteints" active={filters.power === 'off'} onPress={() => setFilters({ ...filters, power: filters.power === 'off' ? 'all' : 'off' })} />
            <FilterChip label="Favoris" active={filters.favoritesOnly} onPress={() => setFilters({ ...filters, favoritesOnly: !filters.favoritesOnly })} />
          </View>
          <Muted>{visible.length} affiché{visible.length > 1 ? 's' : ''}</Muted>
        </View>
      }
      renderItem={({ item }) => (
        <Pressable
          onPress={() => {
            select(item.id);
            if (!expanded) router.push(`/device/${item.id}`);
          }}
          style={[styles.card, { backgroundColor: palette.raised, borderColor: selected === item.id ? palette.accent : palette.line }]}
        >
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: palette.ink, fontSize: 17, fontWeight: '700' }}>{item.name}</Text>
              <Muted>{TYPE_LABEL[item.type]} · {item.manufacturer} · {rooms.find((room) => room.id === item.roomId)?.name ?? 'Sans pièce'}</Muted>
            </View>
            <StatusPill status={item.connectionStatus} />
          </View>
          <Text style={{ color: palette.soft }}>{isPoweredOn(item) ? 'Allumé' : 'État non allumé'}{item.simulated ? ' · Simulation' : ''}</Text>
        </Pressable>
      )}
      ListEmptyComponent={<Muted>Aucun appareil ne correspond. Lancez une recherche ou activez la démonstration dans les réglages.</Muted>}
    />
  );

  if (!expanded) return <View style={{ flex: 1, backgroundColor: palette.bg }}>{list}</View>;
  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: palette.bg }}>
      <View style={{ flex: 0.46 }}>{list}</View>
      <View style={[styles.detail, { borderLeftColor: palette.line }]}>
        {selected ? <DeviceControls deviceId={selected} /> : <Muted>Sélectionnez un appareil. Le choix reste en place quand l’écran se plie.</Muted>}
      </View>
    </View>
  );
}

function FilterChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const palette = usePalette();
  return (
    <Pressable onPress={onPress} style={[styles.chip, { borderColor: active ? palette.accent : palette.line, backgroundColor: active ? palette.accent : palette.raised }]}>
      <Text style={{ color: active ? palette.accentInk : palette.ink }}>{label}</Text>
    </Pressable>
  );
}

function toggle<T extends string>(filters: DeviceFilters, key: 'types' | 'manufacturers' | 'roomIds' | 'groupIds', value: T, setFilters: (filters: DeviceFilters) => void) {
  const current = filters[key] as string[];
  const next = current.includes(value) ? current.filter((item) => item !== value) : [...current, value];
  setFilters({ ...filters, [key]: next });
}

const styles = StyleSheet.create({
  search: { minHeight: 48, borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, fontSize: 16 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, minHeight: 36, justifyContent: 'center' },
  card: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 8 },
  row: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  detail: { flex: 0.54, borderLeftWidth: 1, padding: 20 },
});
