import { Ionicons } from '@expo/vector-icons';
import { router, usePathname } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { usePalette } from '../theme/useTheme';

const ITEMS = [
  { href: '/', label: 'Accueil', icon: 'home-outline' },
  { href: '/devices', label: 'Appareils', icon: 'grid-outline' },
  { href: '/rooms', label: 'Pièces', icon: 'albums-outline' },
  { href: '/add', label: 'Ajouter', icon: 'add-circle-outline' },
  { href: '/settings', label: 'Réglages', icon: 'settings-outline' },
] as const;

export function SideRail() {
  const pathname = usePathname();
  const palette = usePalette();
  return (
    <View style={[styles.rail, { backgroundColor: palette.raised, borderRightColor: palette.line }]}>
      <Text style={[styles.brand, { color: palette.ink }]}>Maison</Text>
      {ITEMS.map((item) => {
        const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
        return (
          <Pressable key={item.href} accessibilityRole="button" onPress={() => router.push(item.href)} style={[styles.item, { backgroundColor: active ? palette.bg : 'transparent' }]}>
            <Ionicons name={item.icon} size={22} color={active ? palette.accent : palette.ink} />
            <Text style={{ color: active ? palette.accent : palette.ink, fontWeight: '600' }}>{item.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  rail: { width: 212, borderRightWidth: 1, padding: 16, gap: 6 },
  brand: { fontSize: 28, fontWeight: '700', marginBottom: 18, letterSpacing: -0.6 },
  item: { minHeight: 48, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10 },
});
