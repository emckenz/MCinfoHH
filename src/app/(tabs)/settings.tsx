import { useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActionButton, Banner, Card, Muted, Title } from '../../components/primitives';
import { errorMessage } from '../../domain/errors';
import { LEVEL_LABEL, SUPPORT_MATRIX } from '../../domain/supportMatrix';
import { Gateway } from '../../domain/types';
import { useHomeStore } from '../../store/homeStore';
import { usePalette } from '../../theme/useTheme';

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const palette = usePalette();
  const theme = useHomeStore((state) => state.theme);
  const setTheme = useHomeStore((state) => state.setTheme);
  const demoMode = useHomeStore((state) => state.demoMode);
  const setDemoMode = useHomeStore((state) => state.setDemoMode);
  const actionError = useHomeStore((state) => state.actionError);
  const secretsPersistent = useHomeStore((state) => state.secretsPersistent);
  const gateways = useHomeStore((state) => state.gateways);
  const saveGateway = useHomeStore((state) => state.saveGateway);
  const connectGateway = useHomeStore((state) => state.connectGateway);
  const importGateway = useHomeStore((state) => state.importGateway);
  const permitJoin = useHomeStore((state) => state.permitJoin);
  const deleteGateway = useHomeStore((state) => state.deleteGateway);
  const inspectUsb = useHomeStore((state) => state.inspectUsb);
  const usbDevices = useHomeStore((state) => state.usbDevices);
  const [showGateway, setShowGateway] = useState(false);
  const [draft, setDraft] = useState({ name: 'Passerelle', type: 'zigbee2mqtt' as Gateway['type'], address: '', port: '8883', tls: true, baseTopic: 'zigbee2mqtt', username: '', secret: '' });
  const [message, setMessage] = useState<string>();

  const act = async (work: () => Promise<void>) => {
    try {
      setMessage(undefined);
      await work();
      setMessage('Opération terminée.');
    } catch (error) {
      setMessage(errorMessage(error));
    }
  };

  return (
    <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 32 }]}>
      <Title>Réglages</Title>
      <Card>
        <Text style={[styles.heading, { color: palette.ink }]}>Thème</Text>
        <View style={styles.row}>
          {(['system', 'light', 'dark'] as const).map((choice) => (
            <ActionButton key={choice} label={choice === 'system' ? 'Système' : choice === 'light' ? 'Clair' : 'Sombre'} emphasis={theme === choice} onPress={() => void setTheme(choice)} />
          ))}
        </View>
      </Card>
      <Card>
        <Text style={[styles.heading, { color: palette.ink }]}>Démonstration</Text>
        <Muted>Ajoute des appareils explicitement simulés : KP400, WeMo, Leviton, Maestro et Orléans. Ils ne remplacent pas les appareils réels.</Muted>
        <Switch value={demoMode} onValueChange={(value) => void setDemoMode(value)} />
        {actionError ? <Banner tone="danger">{actionError}</Banner> : null}
      </Card>
      <Card>
        <Text style={[styles.heading, { color: palette.ink }]}>Pont local, facultatif</Text>
        <Muted>Les appareils Wi-Fi sont cherchés par le téléphone. Ce formulaire ne sert que pour un pont Zigbee2MQTT ou Home Assistant déjà présent sur le réseau local. Il n’ouvre aucun accès depuis Internet.</Muted>
        <Muted>{secretsPersistent ? 'Les secrets sont dans le stockage chiffré Android.' : 'Dans le navigateur, la maison et les secrets restent en mémoire le temps de la session. Rien n’est écrit sur disque, et aucune connexion n’est ouverte tant que l’adresse locale n’est pas valide.'}</Muted>
        <ActionButton label={showGateway ? 'Masquer le formulaire' : 'Configurer un pont local'} onPress={() => setShowGateway((value) => !value)} />
        {showGateway ? (
          <View style={{ gap: 8 }}>
            <Field label="Nom" value={draft.name} onChange={(name) => setDraft({ ...draft, name })} />
            <View style={styles.row}>
              <ActionButton label="Zigbee2MQTT" emphasis={draft.type === 'zigbee2mqtt'} onPress={() => setDraft({ ...draft, type: 'zigbee2mqtt', port: '8883', tls: true })} />
              <ActionButton label="Home Assistant" emphasis={draft.type === 'home-assistant'} onPress={() => setDraft({ ...draft, type: 'home-assistant', port: '8123' })} />
            </View>
            <Field label="Adresse locale" value={draft.address} onChange={(address) => setDraft({ ...draft, address })} />
            <Field label="Port" value={draft.port} onChange={(port) => setDraft({ ...draft, port })} />
            <Field label="Sujet MQTT" value={draft.baseTopic} onChange={(baseTopic) => setDraft({ ...draft, baseTopic })} />
            <Field label="Utilisateur" value={draft.username} onChange={(username) => setDraft({ ...draft, username })} />
            <Field label={draft.type === 'home-assistant' ? 'Jeton' : 'Mot de passe'} value={draft.secret} onChange={(secret) => setDraft({ ...draft, secret })} secure />
            <View style={styles.row}>
              <Text style={{ color: palette.ink }}>TLS</Text>
              <Switch value={draft.tls} onValueChange={(tls) => setDraft({ ...draft, tls })} />
            </View>
            {draft.type === 'zigbee2mqtt' && !draft.tls ? (
              <Banner tone="warn">MQTT sans TLS n’est acceptable que vers une adresse du réseau local. Le mot de passe circule alors en clair sur le LAN.</Banner>
            ) : null}
            <ActionButton label="Enregistrer" emphasis onPress={() => void act(() => saveGateway({ ...draft, port: Number(draft.port), secret: draft.secret || undefined }))} />
            {message ? <Banner tone="info">{message}</Banner> : null}
          </View>
        ) : null}
      </Card>
      {gateways.map((gateway) => (
        <Card key={gateway.id}>
          <Text style={[styles.heading, { color: palette.ink }]}>{gateway.name}</Text>
          <Muted>{gateway.type} · {gateway.address}:{gateway.port} · {gateway.connectionStatus}</Muted>
          {gateway.lastError ? <Banner tone="danger">{gateway.lastError}</Banner> : null}
          <ActionButton label="Connecter" onPress={() => void act(() => connectGateway(gateway.id))} />
          <ActionButton label="Importer les appareils" onPress={() => void act(() => importGateway(gateway.id))} />
          {gateway.type === 'zigbee2mqtt' ? <ActionButton label="Autoriser l’appairage 60 s" onPress={() => void act(() => permitJoin(gateway.id))} /> : null}
          <ActionButton label="Retirer" onPress={() => void deleteGateway(gateway.id)} />
        </Card>
      ))}
      <Card>
        <Text style={[styles.heading, { color: palette.ink }]}>USB Zigbee — expérimental</Text>
        <Muted>Le Fold n’a pas de radio Zigbee. Cette action liste seulement les périphériques USB. Elle ne démarre pas un coordonnateur et n’appaire rien.</Muted>
        <ActionButton label="Inspecter les périphériques USB" onPress={() => void inspectUsb().catch((error) => setMessage(errorMessage(error)))} />
        {usbDevices.map((device, index) => (
          <Muted key={String(device.deviceName ?? index)}>{String(device.manufacturerName ?? 'USB')} {String(device.productName ?? '')} · {String(device.vendorId)}:{String(device.productId)}</Muted>
        ))}
      </Card>
      <Card>
        <Text style={[styles.heading, { color: palette.ink }]}>Compatibilité</Text>
        {SUPPORT_MATRIX.map((entry) => (
          <View key={entry.id} style={{ gap: 4, paddingVertical: 8 }}>
            <Text style={{ color: palette.ink, fontWeight: '700' }}>{entry.device}</Text>
            <Muted>{LEVEL_LABEL[entry.level]}</Muted>
            <Muted>{entry.note}</Muted>
          </View>
        ))}
      </Card>
    </ScrollView>
  );
}

function Field({ label, value, onChange, secure = false }: { label: string; value: string; onChange: (value: string) => void; secure?: boolean }) {
  const palette = usePalette();
  return (
    <View style={{ gap: 4 }}>
      <Muted>{label}</Muted>
      <TextInput value={value} onChangeText={onChange} secureTextEntry={secure} autoCapitalize="none" style={[styles.input, { color: palette.ink, borderColor: palette.line }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, gap: 12 },
  heading: { fontSize: 18, fontWeight: '700' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  input: { minHeight: 48, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12 },
});
