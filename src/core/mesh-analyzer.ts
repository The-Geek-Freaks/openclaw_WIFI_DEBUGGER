import { EventEmitter } from 'eventemitter3';
import { createChildLogger } from '../utils/logger.js';
import { normalizeMac, getVendorFromMac } from '../utils/mac.js';
import { rssiToQuality } from '../utils/frequency.js';
import type { AsusSshClient } from '../infra/asus-ssh-client.js';
import type { 
  MeshNode, 
  NetworkDevice, 
  WifiSettings, 
  MeshNetworkState,
  SignalMeasurement,
  ConnectionEvent 
} from '../types/network.js';

const logger = createChildLogger('mesh-analyzer');

export interface MeshAnalyzerEvents {
  stateUpdated: (state: MeshNetworkState) => void;
  deviceConnected: (device: NetworkDevice) => void;
  deviceDisconnected: (device: NetworkDevice) => void;
  signalDrop: (device: NetworkDevice, oldRssi: number, newRssi: number) => void;
}

const MAX_SIGNAL_HISTORY_ENTRIES = 1000;
const MAX_CONNECTION_EVENTS = 500;

export class MeshAnalyzer extends EventEmitter<MeshAnalyzerEvents> {
  private readonly sshClient: AsusSshClient;
  private currentState: MeshNetworkState | null = null;
  private signalHistory: Map<string, SignalMeasurement[]> = new Map();
  private connectionEvents: ConnectionEvent[] = [];
  private readonly maxHistoryAge: number = 7 * 24 * 60 * 60 * 1000;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(sshClient: AsusSshClient) {
    super();
    this.sshClient = sshClient;
    this.startCleanupInterval();
  }

  private startCleanupInterval(): void {
    this.cleanupInterval = setInterval(() => this.cleanupOldData(), 60 * 60 * 1000);
  }

  private cleanupOldData(): void {
    const cutoff = Date.now() - this.maxHistoryAge;
    
    for (const [key, history] of this.signalHistory) {
      const filtered = history.filter(m => m.timestamp.getTime() >= cutoff);
      if (filtered.length === 0) {
        this.signalHistory.delete(key);
      } else if (filtered.length > MAX_SIGNAL_HISTORY_ENTRIES) {
        this.signalHistory.set(key, filtered.slice(-MAX_SIGNAL_HISTORY_ENTRIES));
      } else {
        this.signalHistory.set(key, filtered);
      }
    }

    this.connectionEvents = this.connectionEvents
      .filter(e => e.timestamp.getTime() >= cutoff)
      .slice(-MAX_CONNECTION_EVENTS);
    
    logger.debug({ 
      signalHistorySize: this.signalHistory.size,
      connectionEventsCount: this.connectionEvents.length 
    }, 'Cleanup complete');
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.signalHistory.clear();
    this.connectionEvents = [];
    this.removeAllListeners();
  }

  async scan(): Promise<MeshNetworkState> {
    logger.info('Starting mesh network scan');

    const [nodes, devices, wifiSettings] = await Promise.all([
      this.scanMeshNodes(),
      this.scanDevices(),
      this.getWifiSettings(),
    ]);

    const state: MeshNetworkState = {
      nodes,
      devices,
      wifiSettings,
      lastUpdated: new Date(),
    };

    this.detectChanges(state);
    this.currentState = state;
    this.emit('stateUpdated', state);

    logger.info({ nodeCount: nodes.length, deviceCount: devices.length }, 'Scan complete');
    return state;
  }

  private async scanMeshNodes(): Promise<MeshNode[]> {
    const nodes: MeshNode[] = [];

    try {
      const systemInfo = await this.sshClient.getSystemInfo();
      await this.sshClient.getAiMeshClientList();
      
      const mainNode: MeshNode = {
        id: 'main',
        name: systemInfo['model'] ?? 'Main Router',
        macAddress: '',
        ipAddress: '',
        isMainRouter: true,
        firmwareVersion: systemInfo['firmware'] ?? 'unknown',
        uptime: this.parseUptime(systemInfo['uptime'] ?? '0 0'),
        cpuUsage: this.parseCpuUsage(systemInfo['cpu'] ?? ''),
        memoryUsage: this.parseMemoryUsage(systemInfo['memory'] ?? ''),
        connectedClients: 0,
        backhaulType: 'wired',
      };
      nodes.push(mainNode);

      try {
        const meshList = await this.sshClient.getMeshNodes();
        const meshEntries = meshList.split('<').filter(Boolean);
        
        for (const entry of meshEntries) {
          const parts = entry.split('>');
          if (parts.length >= 2) {
            const mac = normalizeMac(parts[0] ?? '');
            const alias = parts[1] ?? '';
            const model = parts[2] ?? '';
            const uiModel = parts[3] ?? '';
            const fwver = parts[4] ?? '';
            const _newFwver = parts[5] ?? '';
            const ip = parts[6] ?? '';
            const online = parts[7] ?? '';
            
            const nodeName = alias || uiModel || model || `AiMesh Node ${mac}`;
            const firmwareVersion = fwver || 'unknown';
            const isOnline = online === '1';
            
            logger.debug({ 
              mac, alias, model, fwver, ip, online, partsCount: parts.length 
            }, 'Parsed mesh node entry');
            
            nodes.push({
              id: mac,
              name: nodeName,
              macAddress: mac,
              ipAddress: ip,
              isMainRouter: false,
              firmwareVersion,
              uptime: 0,
              cpuUsage: 0,
              memoryUsage: 0,
              connectedClients: 0,
              backhaulType: 'mesh_backhaul',
            });
          }
        }
      } catch (err) {
        logger.warn({ err }, 'Failed to get mesh node list');
      }
    } catch (err) {
      logger.error({ err }, 'Failed to scan mesh nodes');
    }

    return nodes;
  }

  private async scanDevices(): Promise<NetworkDevice[]> {
    const devices: Map<string, NetworkDevice> = new Map();
    const now = new Date();

    try {
      const arpTable = await this.sshClient.getArpTable();
      const arpLines = arpTable.split('\n').slice(1);

      for (const line of arpLines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 4) {
          const ip = parts[0];
          const mac = normalizeMac(parts[3] ?? '');
          
          if (mac && mac !== '00:00:00:00:00:00') {
            devices.set(mac, {
              macAddress: mac,
              ipAddress: ip,
              hostname: undefined,
              vendor: getVendorFromMac(mac),
              connectionType: 'wired',
              connectedToNode: 'main',
              status: 'online',
              lastSeen: now,
              firstSeen: now,
              disconnectCount: 0,
              avgConnectionDuration: 0,
            });
          }
        }
      }
    } catch (err) {
      logger.warn({ err }, 'Failed to parse ARP table');
    }

    try {
      const dhcpLeases = await this.sshClient.getDhcpLeases();
      const leaseLines = dhcpLeases.split('\n');

      for (const line of leaseLines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 4) {
          const mac = normalizeMac(parts[1] ?? '');
          const ip = parts[2];
          const hostname = parts[3];

          if (devices.has(mac)) {
            const device = devices.get(mac)!;
            device.ipAddress = ip;
            device.hostname = hostname !== '*' ? hostname : undefined;
          }
        }
      }
    } catch (err) {
      logger.warn({ err }, 'Failed to parse DHCP leases');
    }

    try {
      const wirelessClients = await this.sshClient.getWirelessClients();
      const macMatches = wirelessClients.match(/([0-9A-Fa-f:]{17})/g) ?? [];
      
      const allSignals = await this.sshClient.getAllClientSignals();
      logger.debug({ signalCount: allSignals.size }, 'Collected client signal strengths');

      for (const mac of macMatches) {
        const normalizedMac = normalizeMac(mac);
        if (devices.has(normalizedMac)) {
          const device = devices.get(normalizedMac)!;
          device.connectionType = 'wireless_5g';
          
          const rssi = allSignals.get(normalizedMac);
          if (rssi !== undefined) {
            device.signalStrength = rssi;
            this.recordSignalMeasurement(normalizedMac, 'main', rssi);
            logger.debug({ mac: normalizedMac, rssi }, 'Signal strength recorded');
          }
        }
      }
    } catch (err) {
      logger.warn({ err }, 'Failed to get wireless clients');
    }

    return Array.from(devices.values());
  }

  private async getWifiSettings(): Promise<WifiSettings[]> {
    const settings: WifiSettings[] = [];

    try {
      const nvram = await this.sshClient.getWifiSettings();

      const parseChannel = (val: string | undefined): number => {
        const parsed = parseInt(val ?? '0', 10);
        return isNaN(parsed) ? 0 : parsed;
      };

      const parseBandwidth = (val: string | undefined, defaultMhz: number): number => {
        const code = parseInt(val ?? '', 10);
        if (isNaN(code)) return defaultMhz;
        const bwMap: Record<number, number> = {
          0: 20,
          1: 40,
          2: 80,
          3: 160,
          4: 80,   // 80+80 fallback
          5: 320,  // WiFi 7
        };
        return bwMap[code] ?? defaultMhz;
      };

      settings.push({
        ssid: nvram['wl0_ssid'] ?? '',
        band: '2.4GHz',
        channel: parseChannel(nvram['wl0_channel']),
        channelWidth: parseBandwidth(nvram['wl0_bw'], 20),
        txPower: parseChannel(nvram['wl0_txpower']) || 100,
        standard: '802.11ax',
        security: 'WPA3',
        bandSteering: nvram['wl0_bsd_steering_policy'] !== '0',
        smartConnect: nvram['smart_connect_x'] === '1',
        roamingAssistant: true,
        beamforming: true,
        muMimo: true,
      });

      settings.push({
        ssid: nvram['wl1_ssid'] ?? '',
        band: '5GHz',
        channel: parseChannel(nvram['wl1_channel']),
        channelWidth: parseBandwidth(nvram['wl1_bw'], 80),
        txPower: parseChannel(nvram['wl1_txpower']) || 100,
        standard: '802.11ax',
        security: 'WPA3',
        bandSteering: nvram['wl1_bsd_steering_policy'] !== '0',
        smartConnect: nvram['smart_connect_x'] === '1',
        roamingAssistant: true,
        beamforming: true,
        muMimo: true,
      });
    } catch (err) {
      logger.error({ err }, 'Failed to get WiFi settings');
    }

    return settings;
  }

  private detectChanges(newState: MeshNetworkState): void {
    if (!this.currentState) return;

    const oldDevices = new Map(this.currentState.devices.map(d => [d.macAddress, d]));
    const newDevices = new Map(newState.devices.map(d => [d.macAddress, d]));

    for (const [mac, device] of newDevices) {
      if (!oldDevices.has(mac)) {
        this.connectionEvents.push({
          timestamp: new Date(),
          eventType: 'connect',
          deviceMac: mac,
          nodeMac: device.connectedToNode,
        });
        this.emit('deviceConnected', device);
      } else {
        const oldDevice = oldDevices.get(mac)!;
        if (device.signalStrength && oldDevice.signalStrength) {
          const drop = oldDevice.signalStrength - device.signalStrength;
          if (drop > 10) {
            this.emit('signalDrop', device, oldDevice.signalStrength, device.signalStrength);
          }
        }
      }
    }

    for (const [mac, device] of oldDevices) {
      if (!newDevices.has(mac)) {
        this.connectionEvents.push({
          timestamp: new Date(),
          eventType: 'disconnect',
          deviceMac: mac,
          nodeMac: device.connectedToNode,
        });
        this.emit('deviceDisconnected', device);
      }
    }
  }

  private recordSignalMeasurement(deviceMac: string, nodeMac: string, rssi: number): void {
    const key = `${deviceMac}:${nodeMac}`;
    let history = this.signalHistory.get(key);
    
    if (!history) {
      history = [];
      this.signalHistory.set(key, history);
    }

    history.push({
      timestamp: new Date(),
      deviceMac,
      nodeMac,
      rssi,
      channel: 0,
      channelWidth: 0,
      txRate: 0,
      rxRate: 0,
    });

    if (history.length > MAX_SIGNAL_HISTORY_ENTRIES) {
      this.signalHistory.set(key, history.slice(-MAX_SIGNAL_HISTORY_ENTRIES));
    }
  }

  private parseUptime(uptimeStr: string): number {
    const parts = uptimeStr.trim().split(/\s+/);
    return parseFloat(parts[0] ?? '0');
  }

  private parseCpuUsage(cpuStr: string): number {
    const match = cpuStr.match(/(\d+)%\s*idle/);
    if (match) {
      return 100 - parseInt(match[1]!, 10);
    }
    return 0;
  }

  private parseMemoryUsage(memStr: string): number {
    const lines = memStr.split('\n');
    for (const line of lines) {
      if (line.startsWith('Mem:')) {
        const parts = line.split(/\s+/);
        const total = parseInt(parts[1] ?? '1', 10);
        const used = parseInt(parts[2] ?? '0', 10);
        return Math.round((used / total) * 100);
      }
    }
    return 0;
  }

  getSignalHistory(deviceMac: string): SignalMeasurement[] {
    const result: SignalMeasurement[] = [];
    for (const [key, measurements] of this.signalHistory) {
      if (key.startsWith(deviceMac)) {
        result.push(...measurements);
      }
    }
    return result.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  getConnectionEvents(deviceMac?: string): ConnectionEvent[] {
    if (deviceMac) {
      return this.connectionEvents.filter(e => e.deviceMac === deviceMac);
    }
    return [...this.connectionEvents];
  }

  getDeviceSignalQuality(deviceMac: string): number {
    const history = this.getSignalHistory(deviceMac);
    if (history.length === 0) return 0;
    
    const recent = history.slice(-10);
    const avgRssi = recent.reduce((sum, m) => sum + m.rssi, 0) / recent.length;
    return rssiToQuality(avgRssi);
  }

  getCurrentState(): MeshNetworkState | null {
    return this.currentState;
  }
}
