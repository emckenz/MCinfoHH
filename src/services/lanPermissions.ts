import { PermissionsAndroid, Platform } from 'react-native';

export async function requestLanPermissions(): Promise<void> {
  if (Platform.OS !== 'android') return;
  const permissions: Array<(typeof PermissionsAndroid.PERMISSIONS)[keyof typeof PermissionsAndroid.PERMISSIONS]> = [
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
  ];
  const nearby = PermissionsAndroid.PERMISSIONS.NEARBY_WIFI_DEVICES;
  if (nearby) permissions.push(nearby);
  await PermissionsAndroid.requestMultiple(permissions);
}
