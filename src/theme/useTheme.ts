import { useColorScheme } from 'react-native';

import { useHomeStore } from '../store/homeStore';
import { darkPalette, lightPalette, Palette } from './palette';

export function usePalette(): Palette {
  const scheme = useColorScheme();
  const choice = useHomeStore((state) => state.theme);
  const mode = choice === 'system' ? scheme ?? 'light' : choice;
  return mode === 'dark' ? darkPalette : lightPalette;
}
