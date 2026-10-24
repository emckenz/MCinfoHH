import type { ActiveNetwork, BleAdvertisement, BleInspection, MdnsService, UdpReply, UsbDeviceInfo } from 'home-network';

export interface HttpResult {
  status: number;
  body: string;
}

export interface SocketHandle {
  write(bytes: Uint8Array): Promise<void>;
  read(timeoutMs: number, maxBytes: number): Promise<Uint8Array>;
  close(): Promise<void>;
}

export interface NetworkTransport {
  getActiveNetwork(): Promise<ActiveNetwork & { broadcast: string | null }>;
  udpCollect(hosts: string[], port: number, payloadBase64: string, timeoutMs: number): Promise<UdpReply[]>;
  tcpExchange(host: string, port: number, payloadBase64: string, timeoutMs: number, framed: 'kasa' | 'raw'): Promise<string>;
  ssdpSearch(payloads: string[], timeoutMs: number): Promise<string[]>;
  mdnsBrowse(types: string[], timeoutMs: number): Promise<MdnsService[]>;
  bleScan(timeoutMs: number): Promise<BleAdvertisement[]>;
  bleInspect(address: string, timeoutMs: number): Promise<BleInspection>;
  listUsbDevices(): Promise<UsbDeviceInfo[]>;
  httpRequest(url: string, init: { method: string; headers?: Record<string, string>; body?: string; timeoutMs: number }): Promise<HttpResult>;
  openSocket(host: string, port: number, tls: boolean, timeoutMs: number): Promise<SocketHandle>;
}
