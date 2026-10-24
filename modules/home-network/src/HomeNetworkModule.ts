import { NativeModule, requireNativeModule } from 'expo';

import {
  ActiveNetwork,
  BleAdvertisement,
  BleInspection,
  MdnsService,
  UdpReply,
  UsbDeviceInfo,
} from './HomeNetwork.types';

declare class HomeNetworkModule extends NativeModule {
  getActiveNetwork(): Promise<ActiveNetwork>;
  udpCollect(hosts: string[], port: number, payloadBase64: string, timeoutMs: number): Promise<UdpReply[]>;
  tcpExchange(host: string, port: number, payloadBase64: string, timeoutMs: number, framed: string): Promise<string>;
  ssdpSearch(payloads: string[], timeoutMs: number): Promise<string[]>;
  mdnsBrowse(types: string[], timeoutMs: number): Promise<MdnsService[]>;
  bleScan(timeoutMs: number): Promise<BleAdvertisement[]>;
  bleInspect(address: string, timeoutMs: number): Promise<BleInspection>;
  listUsbDevices(): Promise<UsbDeviceInfo[]>;
  socketOpen(host: string, port: number, tls: boolean, timeoutMs: number): Promise<string>;
  socketWrite(id: string, payloadBase64: string): Promise<void>;
  socketRead(id: string, timeoutMs: number, maxBytes: number): Promise<string>;
  socketClose(id: string): Promise<void>;
}

export default requireNativeModule<HomeNetworkModule>('HomeNetwork');
