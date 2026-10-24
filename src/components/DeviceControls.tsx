import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { errorMessage } from '../domain/errors';
import { TYPE_LABEL } from '../domain/types';
import { useHomeStore } from '../store/homeStore';
import { usePalette } from '../theme/useTheme';
import { Banner, Muted, StatusPill, Title } from './primitives';

export function DeviceControls({ deviceId }: { deviceId: string }) {
  const device = useHomeStore((state) => state.devices.find((item) => item.id === deviceId));
  const execute = useHomeStore((state) => state.execute);
  const refresh = useHomeStore((state) => state.refreshDevice);
  const rename = useHomeStore((state) => state.renameDevice);
  const favorite = useHomeStore((state) => state.toggleFavorite);
  const rooms = useHomeStore((state) => state.rooms);
  const assignRoom = useHomeStore((state) => state.assignRoom);
  const groups = useHomeStore((state) => state.groups);
  const toggleGroup = useHomeStore((state) => state.toggleGroup);
  const palette = usePalette();
  const [error, setError] = useState<string>();
  const [name, setName] = useState(device?.name ?? '');

  if (!device) return <Muted>Cet appareil n’est plus dans la maison.</Muted>;

  const controllable = device.simulated || device.connectionStatus === 'connected' || device.connectionStatus === 'compatible';
  const run = async (command: Parameters<typeof execute>[1]) => {
    setError(undefined);
    try {
      await execute(device.id, command);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  };

  return (
    <View style={styles.stack}>
      <View style={styles.row}>
        <View style={{ flex: 1, gap: 4 }}>
          <Title>{device.name}</Title>
          <Muted>{device.manufacturer} · {device.model} · {TYPE_LABEL[device.type]}</Muted>
        </View>
        <StatusPill status={device.connectionStatus} />
      </View>
      {device.simulated ? <Banner tone="sim">Simulation. Aucune commande n’a été envoyée sur le réseau.</Banner> : null}
      <Banner tone={device.hardwareVerified ? 'info' : 'warn'}>
        {device.hardwareVerified
          ? 'Un échange réseau a réussi depuis cette installation. Cela ne remplace pas un essai physique noté dans la matrice.'
          : device.compatibilityNote}
      </Banner>
      {device.lastError ? <Banner tone="danger">{device.lastError}</Banner> : null}
      {error ? <Banner tone="danger">{error}</Banner> : null}

      {device.capabilities.filter((capability) => capability.kind === 'outlet').map((capability) => {
        const outlet = device.currentState.outlets?.[capability.outletId ?? ''];
        return (
          <View key={capability.id} style={[styles.control, { borderColor: palette.line, backgroundColor: palette.raised }]}>
            <Text style={[styles.label, { color: palette.ink }]}>{capability.label || 'Sortie'}</Text>
            <Text style={{ color: palette.soft }}>{outlet?.on ? 'Allumée' : 'Éteinte'}</Text>
            <View style={styles.row}>
              <Choice label="Marche" active={outlet?.on === true} disabled={!controllable} onPress={() => void run({ type: 'setOnOff', on: true, outletId: capability.outletId })} />
              <Choice label="Arrêt" active={outlet?.on === false} disabled={!controllable} onPress={() => void run({ type: 'setOnOff', on: false, outletId: capability.outletId })} />
            </View>
          </View>
        );
      })}

      {device.capabilities.some((capability) => capability.kind === 'onOff') ? (
        <View style={[styles.control, { borderColor: palette.line, backgroundColor: palette.raised }]}>
          <Text style={[styles.label, { color: palette.ink }]}>{device.currentState.on ? 'Allumé' : 'Éteint'}</Text>
          <View style={styles.row}>
            <Choice label="Marche" active={device.currentState.on === true} disabled={!controllable} onPress={() => void run({ type: 'setOnOff', on: true })} />
            <Choice label="Arrêt" active={device.currentState.on === false} disabled={!controllable} onPress={() => void run({ type: 'setOnOff', on: false })} />
          </View>
        </View>
      ) : null}

      {device.capabilities.some((capability) => capability.kind === 'brightness') ? (
        <Stepper
          label="Intensité"
          value={`${device.currentState.brightness ?? 0} %`}
          disabled={!controllable}
          onMinus={() => void run({ type: 'setBrightness', brightness: Math.max(0, (device.currentState.brightness ?? 0) - 10) })}
          onPlus={() => void run({ type: 'setBrightness', brightness: Math.min(100, (device.currentState.brightness ?? 0) + 10) })}
        />
      ) : null}

      {device.capabilities.some((capability) => capability.kind === 'colorHs') ? (
        <Stepper
          label="Teinte"
          value={`${Math.round(device.currentState.hue ?? 0)}°`}
          disabled={!controllable}
          onMinus={() => void run({ type: 'setColorHs', hue: (device.currentState.hue ?? 0) - 15, saturation: device.currentState.saturation ?? 80 })}
          onPlus={() => void run({ type: 'setColorHs', hue: (device.currentState.hue ?? 0) + 15, saturation: device.currentState.saturation ?? 80 })}
        />
      ) : null}

      {device.capabilities.some((capability) => capability.kind === 'thermostat') ? (
        <View style={[styles.control, { borderColor: palette.line, backgroundColor: palette.raised }]}>
          <Text style={[styles.temp, { color: palette.ink }]}>{formatTemp(device.currentState.currentTemperatureC)}</Text>
          <Muted>Ambiante · consigne {formatTemp(device.currentState.targetTemperatureC)}</Muted>
          <Muted>Chauffage : {device.currentState.heating ? 'en marche' : 'au repos'} · mode {device.currentState.mode ?? 'inconnu'}</Muted>
          <Stepper
            label="Consigne"
            value={formatTemp(device.currentState.targetTemperatureC)}
            disabled={!controllable}
            onMinus={() => void run({ type: 'setTargetTemperature', celsius: (device.currentState.targetTemperatureC ?? 20) - 0.5 })}
            onPlus={() => void run({ type: 'setTargetTemperature', celsius: (device.currentState.targetTemperatureC ?? 20) + 0.5 })}
          />
          <View style={styles.wrap}>
            {(device.capabilities.find((capability) => capability.kind === 'thermostat')?.modes ?? []).map((mode) => (
              <Choice key={mode} label={mode} active={device.currentState.mode === mode} disabled={!controllable} onPress={() => void run({ type: 'setMode', mode })} />
            ))}
          </View>
        </View>
      ) : null}

      {!controllable ? <Muted>Les commandes sont masquées tant que le protocole n’est pas commandable.</Muted> : null}
      <ActionRow>
        <Choice label="Actualiser" onPress={() => void refresh(device.id)} />
        <Choice label={device.isFavorite ? 'Retirer des favoris' : 'Favori'} onPress={() => void favorite(device.id)} />
      </ActionRow>
      <TextInput
        value={name}
        onChangeText={setName}
        onEndEditing={() => void rename(device.id, name)}
        style={[styles.input, { color: palette.ink, borderColor: palette.line, backgroundColor: palette.raised }]}
        placeholder="Nom de l’appareil"
        placeholderTextColor={palette.soft}
      />
      <Muted>Pièce</Muted>
      <View style={styles.wrap}>
        <Choice label="Aucune" active={!device.roomId} onPress={() => void assignRoom(device.id, undefined)} />
        {rooms.map((room) => (
          <Choice key={room.id} label={room.name} active={device.roomId === room.id} onPress={() => void assignRoom(device.id, room.id)} />
        ))}
      </View>
      <Muted>Groupes</Muted>
      <View style={styles.wrap}>
        {groups.map((group) => (
          <Choice key={group.id} label={group.name} active={device.groupIds.includes(group.id)} onPress={() => void toggleGroup(device.id, group.id)} />
        ))}
      </View>
    </View>
  );
}

function Stepper({ label, value, onMinus, onPlus, disabled = false }: { label: string; value: string; onMinus: () => void; onPlus: () => void; disabled?: boolean }) {
  const palette = usePalette();
  return (
    <View style={[styles.control, { borderColor: palette.line, backgroundColor: palette.raised }]}>
      <Text style={[styles.label, { color: palette.ink }]}>{label}</Text>
      <View style={styles.row}>
        <Choice label="−" disabled={disabled} onPress={onMinus} />
        <Text style={[styles.temp, { color: palette.ink, fontSize: 22 }]}>{value}</Text>
        <Choice label="+" disabled={disabled} onPress={onPlus} />
      </View>
    </View>
  );
}

function Choice({ label, onPress, active = false, disabled = false }: { label: string; onPress: () => void; active?: boolean; disabled?: boolean }) {
  const palette = usePalette();
  return (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.choice, { borderColor: active ? palette.accent : palette.line, backgroundColor: active ? palette.accent : 'transparent', opacity: disabled ? 0.4 : 1 }]}>
      <Text style={{ color: active ? palette.accentInk : palette.ink, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

function ActionRow({ children }: { children: React.ReactNode }) {
  return <View style={styles.row}>{children}</View>;
}

function formatTemp(value?: number): string {
  return value === undefined ? '—' : `${value.toFixed(1)} °C`;
}

const styles = StyleSheet.create({
  stack: { gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  control: { borderWidth: 1, borderRadius: 18, padding: 14, gap: 8 },
  label: { fontSize: 16, fontWeight: '700' },
  temp: { fontSize: 42, fontWeight: '700', letterSpacing: -1 },
  choice: { minHeight: 44, minWidth: 72, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  input: { minHeight: 48, borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, fontSize: 16 },
});
