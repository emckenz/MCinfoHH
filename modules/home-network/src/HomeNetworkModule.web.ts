import { NativeModule, registerWebModule } from 'expo';

const UNAVAILABLE = 'Cette fonction nécessite le development build Android. Expo Go et le navigateur ne chargent pas le module natif.';

class HomeNetworkModule extends NativeModule {
  async getActiveNetwork() {
    return {
      connected: false,
      ssid: null,
      ipAddress: null,
      prefixLength: null,
      interfaceName: null,
      transport: 'none' as const,
      frequencyMhz: null,
      vpn: false,
    };
  }

  async udpCollect(): Promise<never> {
    throw new Error(UNAVAILABLE);
  }

  async tcpExchange(): Promise<never> {
    throw new Error(UNAVAILABLE);
  }

  async ssdpSearch(): Promise<never> {
    throw new Error(UNAVAILABLE);
  }

  async mdnsBrowse(): Promise<never> {
    throw new Error(UNAVAILABLE);
  }

  async bleScan(): Promise<never> {
    throw new Error(UNAVAILABLE);
  }

  async bleInspect(): Promise<never> {
    throw new Error(UNAVAILABLE);
  }

  async listUsbDevices(): Promise<never> {
    throw new Error(UNAVAILABLE);
  }

  async socketOpen(): Promise<never> {
    throw new Error(UNAVAILABLE);
  }

  async socketWrite(): Promise<never> {
    throw new Error(UNAVAILABLE);
  }

  async socketRead(): Promise<never> {
    throw new Error(UNAVAILABLE);
  }

  async socketClose(): Promise<void> {
    return;
  }
}

export default registerWebModule(HomeNetworkModule, 'HomeNetwork');
