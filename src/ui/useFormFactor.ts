import { useWindowDimensions } from 'react-native';

export function useFormFactor() {
  const window = useWindowDimensions();
  const expanded = window.width >= 600;
  return {
    width: window.width,
    height: window.height,
    expanded,
    landscape: window.width > window.height,
    cover: window.width < 420,
  };
}
