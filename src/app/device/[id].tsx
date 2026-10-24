import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DeviceControls } from '../../components/DeviceControls';
import { ActionButton } from '../../components/primitives';
import { usePalette } from '../../theme/useTheme';

export default function DeviceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const palette = usePalette();
  return (
    <ScrollView style={{ backgroundColor: palette.bg }} contentContainerStyle={[styles.content, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24 }]}>
      <View style={{ alignSelf: 'flex-start' }}>
        <ActionButton label="Retour" onPress={() => router.back()} />
      </View>
      {id ? <DeviceControls deviceId={id} /> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({ content: { paddingHorizontal: 20, gap: 12 } });
