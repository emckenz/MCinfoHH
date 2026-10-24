export type ActiveNetwork = {
  connected: boolean;
  ssid: string | null;
  ipAddress: string | null;
  prefixLength: number | null;
  interfaceName: string | null;
  transport: 'wifi' | 'ethernet' | 'cellular' | 'other' | 'none';
  frequencyMhz: number | null;
  vpn: boolean;
};

export type UdpReply = {
  host: string;
  port: number;
  payloadBase64: string;
};

export type MdnsService = {
  name: string;
  type: string;
  host: string | null;
  port: number;
  txt: Record<string, string>;
};

export type BleAdvertisement = {
  address: string;
  name: string | null;
  rssi: number;
  serviceUuids: string[];
  manufacturerIds: number[];
};

export type BleCharacteristic = {
  uuid: string;
  properties: string[];
  valueBase64: string | null;
  error: string | null;
};

export type BleService = {
  uuid: string;
  characteristics: BleCharacteristic[];
};

export type BleInspection = {
  address: string;
  name: string | null;
  services: BleService[];
};

export type UsbInterfaceInfo = {
  id: number;
  class: number;
  subclass: number;
  protocol: number;
};

export type UsbDeviceInfo = {
  deviceName: string;
  vendorId: number;
  productId: number;
  deviceClass: number;
  productName: string | null;
  manufacturerName: string | null;
  interfaceCount: number;
  interfaces: UsbInterfaceInfo[];
};

export type HomeNetworkModuleEvents = Record<string, never>;
