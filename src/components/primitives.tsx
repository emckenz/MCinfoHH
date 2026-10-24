import { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ConnectionStatus, STATUS_LABEL } from '../domain/types';
import { Palette } from '../theme/palette';
import { usePalette } from '../theme/useTheme';

export function Screen({ children }: { children: ReactNode }) {
  const palette = usePalette();
  return <View style={[styles.screen, { backgroundColor: palette.bg }]}>{children}</View>;
}

export function Title({ children }: { children: string }) {
  const palette = usePalette();
  return <Text style={[styles.title, { color: palette.ink }]}>{children}</Text>;
}

export function Muted({ children }: { children: ReactNode }) {
  const palette = usePalette();
  return <Text style={[styles.muted, { color: palette.soft }]}>{children}</Text>;
}

export function Card({ children, onPress }: { children: ReactNode; onPress?: () => void }) {
  const palette = usePalette();
  const body = <View style={[styles.card, { backgroundColor: palette.raised, borderColor: palette.line }]}>{children}</View>;
  if (!onPress) return body;
  return <Pressable onPress={onPress}>{body}</Pressable>;
}

export function Banner({ children, tone = 'info' }: { children: string; tone?: 'info' | 'sim' | 'warn' | 'danger' }) {
  const palette = usePalette();
  const color = tone === 'sim' ? palette.sim : tone === 'warn' ? palette.warn : tone === 'danger' ? palette.danger : palette.info;
  return (
    <View style={[styles.banner, { borderColor: color }]}>
      <Text style={[styles.bannerText, { color }]}>{children}</Text>
    </View>
  );
}

export function StatusPill({ status }: { status: ConnectionStatus }) {
  const palette = usePalette();
  const color = statusColor(status, palette);
  return (
    <View style={[styles.pill, { borderColor: color }]}>
      <Text style={[styles.pillText, { color }]}>{STATUS_LABEL[status]}</Text>
    </View>
  );
}

export function ActionButton({ label, onPress, disabled = false, emphasis = false }: { label: string; onPress: () => void; disabled?: boolean; emphasis?: boolean }) {
  const palette = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, { backgroundColor: emphasis ? palette.accent : palette.raised, borderColor: emphasis ? palette.accent : palette.line, opacity: disabled ? 0.45 : 1 }]}
    >
      <Text style={[styles.buttonText, { color: emphasis ? palette.accentInk : palette.ink }]}>{label}</Text>
    </Pressable>
  );
}

export function statusColor(status: ConnectionStatus, palette: Palette): string {
  if (status === 'connected') return palette.on;
  if (status === 'compatible') return palette.info;
  if (status === 'authentication_required') return palette.warn;
  if (status === 'incompatible') return palette.danger;
  return palette.soft;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  title: { fontSize: 32, lineHeight: 36, fontWeight: '700', letterSpacing: -0.8 },
  muted: { fontSize: 15, lineHeight: 21 },
  card: { borderWidth: 1, borderRadius: 18, padding: 16, gap: 8 },
  banner: { borderWidth: 1, borderRadius: 14, padding: 12 },
  bannerText: { fontSize: 14, lineHeight: 20 },
  pill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start' },
  pillText: { fontSize: 12, fontWeight: '600' },
  button: { minHeight: 48, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  buttonText: { fontSize: 15, fontWeight: '600' },
});
