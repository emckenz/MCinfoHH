import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';

import { usePalette } from '../../theme/useTheme';
import { useFormFactor } from '../../ui/useFormFactor';

function tabIconColor(color: unknown, fallback: string): string {
  return typeof color === 'string' ? color : fallback;
}

export default function TabLayout() {
  const palette = usePalette();
  const { expanded } = useFormFactor();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: palette.accent,
        tabBarInactiveTintColor: palette.soft,
        tabBarStyle: expanded
          ? { display: 'none' }
          : { backgroundColor: palette.raised, borderTopColor: palette.line, height: 68, paddingBottom: 8, paddingTop: 6 },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Accueil', tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" color={tabIconColor(color, palette.ink)} size={size ?? 22} /> }} />
      <Tabs.Screen name="devices" options={{ title: 'Appareils', tabBarIcon: ({ color, size }) => <Ionicons name="grid-outline" color={tabIconColor(color, palette.ink)} size={size ?? 22} /> }} />
      <Tabs.Screen name="rooms" options={{ title: 'Pièces', tabBarIcon: ({ color, size }) => <Ionicons name="albums-outline" color={tabIconColor(color, palette.ink)} size={size ?? 22} /> }} />
      <Tabs.Screen name="add" options={{ title: 'Ajouter', tabBarIcon: ({ color, size }) => <Ionicons name="add-circle-outline" color={tabIconColor(color, palette.ink)} size={size ?? 22} /> }} />
      <Tabs.Screen name="settings" options={{ title: 'Réglages', tabBarIcon: ({ color, size }) => <Ionicons name="settings-outline" color={tabIconColor(color, palette.ink)} size={size ?? 22} /> }} />
    </Tabs>
  );
}
