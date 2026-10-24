import 'react-native-gesture-handler';

import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { SideRail } from '../components/SideRail';
import { useHomeStore } from '../store/homeStore';
import { usePalette } from '../theme/useTheme';
import { useFormFactor } from '../ui/useFormFactor';

export default function RootLayout() {
  const bootstrap = useHomeStore((state) => state.bootstrap);
  const palette = usePalette();
  const { expanded } = useFormFactor();

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  return (
    <SafeAreaProvider>
      <StatusBar style={palette.mode === 'dark' ? 'light' : 'dark'} />
      <View style={{ flex: 1, flexDirection: expanded ? 'row' : 'column', backgroundColor: palette.bg }}>
        {expanded ? <SideRail /> : null}
        <View style={{ flex: 1 }}>
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: palette.bg } }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="device/[id]" />
            <Stack.Screen name="room/[id]" />
            <Stack.Screen name="group/[id]" />
          </Stack>
        </View>
      </View>
    </SafeAreaProvider>
  );
}
