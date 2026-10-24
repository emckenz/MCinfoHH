import HomeNetwork from 'home-network';

import { assertLanHost, isPrivateIpv4 } from '../domain/localAddress';
import { subnetFromPrefix } from '../domain/subnet';
import { base64ToBytes, bytesToBase64 } from '../protocol/bytes';
import { NetworkTransport, SocketHandle } from './types';

function assertCommandHost(host: string): void {
  assertLanHost(host);
}

function assertDiscoveryHost(host: string): void {
  if (host === '255.255.255.255') return;
  if (isPrivateIpv4(host)) return;
  throw new Error('Découverte limitée au réseau local.');
}

async function httpRequest(url: string, init: { method: string; headers?: Record<string, string>; body?: string; timeoutMs: number }) {
  const target = new URL(url);
  assertCommandHost(target.hostname);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs);
  try {
    const response = await fetch(url, {
      method: init.method,
      headers: init.headers,
      body: init.body,
      signal: controller.signal,
    });
    return { status: response.status, body: await response.text() };
  } finally {
    clearTimeout(timer);
  }
}

class AndroidSocket implements SocketHandle {
  constructor(private id: string) {}

  async write(bytes: Uint8Array): Promise<void> {
    await HomeNetwork.socketWrite(this.id, bytesToBase64(bytes));
  }

  async read(timeoutMs: number, maxBytes: number): Promise<Uint8Array> {
    const payload = await HomeNetwork.socketRead(this.id, timeoutMs, maxBytes);
    return payload ? base64ToBytes(payload) : new Uint8Array();
  }

  async close(): Promise<void> {
    await HomeNetwork.socketClose(this.id);
  }
}

export function createAndroidTransport(): NetworkTransport {
  return {
    async getActiveNetwork() {
      const network = await HomeNetwork.getActiveNetwork();
      const broadcast = network.ipAddress && network.prefixLength != null
        ? subnetFromPrefix(network.ipAddress, network.prefixLength)?.broadcast ?? null
        : null;
      return { ...network, broadcast };
    },
    async udpCollect(hosts, port, payloadBase64, timeoutMs) {
      hosts.forEach(assertDiscoveryHost);
      return HomeNetwork.udpCollect(hosts, port, payloadBase64, timeoutMs);
    },
    async tcpExchange(host, port, payloadBase64, timeoutMs, framed) {
      assertCommandHost(host);
      return HomeNetwork.tcpExchange(host, port, payloadBase64, timeoutMs, framed);
    },
    ssdpSearch(payloads, timeoutMs) {
      return HomeNetwork.ssdpSearch(payloads, timeoutMs);
    },
    mdnsBrowse(types, timeoutMs) {
      return HomeNetwork.mdnsBrowse(types, timeoutMs);
    },
    bleScan(timeoutMs) {
      return HomeNetwork.bleScan(timeoutMs);
    },
    bleInspect(address, timeoutMs) {
      return HomeNetwork.bleInspect(address, timeoutMs);
    },
    listUsbDevices() {
      return HomeNetwork.listUsbDevices();
    },
    httpRequest,
    async openSocket(host, port, tls, timeoutMs) {
      assertCommandHost(host);
      const id = await HomeNetwork.socketOpen(host, port, tls, timeoutMs);
      return new AndroidSocket(id);
    },
  };
}
