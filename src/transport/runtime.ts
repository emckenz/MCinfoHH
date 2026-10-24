import { Platform } from 'react-native';

import { createAndroidTransport } from './androidTransport';
import { NetworkTransport } from './types';

let current: NetworkTransport | null = null;

export function setTransport(transport: NetworkTransport): void {
  current = transport;
}

export function getTransport(): NetworkTransport {
  if (!current) {
    current = Platform.OS === 'android' ? createAndroidTransport() : unavailableTransport();
  }
  return current;
}

function unavailableTransport(): NetworkTransport {
  const fail = async () => {
    throw new Error('La découverte native est disponible dans le development build Android, pas dans Expo Go ni dans le navigateur.');
  };
  return {
    async getActiveNetwork() {
      return {
        connected: false,
        ssid: null,
        ipAddress: null,
        prefixLength: null,
        interfaceName: null,
        transport: 'none',
        frequencyMhz: null,
        vpn: false,
        broadcast: null,
      };
    },
    udpCollect: fail,
    tcpExchange: fail,
    ssdpSearch: fail,
    mdnsBrowse: fail,
    bleScan: fail,
    bleInspect: fail,
    listUsbDevices: fail,
    httpRequest: fail,
    openSocket: fail,
  };
}
