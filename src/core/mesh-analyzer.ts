import { EventEmitter } from 'eventemitter3';
import { createChildLogger } from '../utils/logger.js';
import { normalizeMac, getVendorFromMac } from '../utils/mac.js';
import { rssiToQuality } from '../utils/frequency.js';
import type { AsusSshClient } from '../infra/asus-ssh-client.js';
import type { MeshNodePool } from '../infra/mesh-node-pool.js';
import type { RealTriangulationEngine } from './real-triangulation.js';
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
  private nodePool: MeshNodePool | null = null;
  private triangulationEngine: RealTriangulationEngine | null = null;
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

  setNodePool(nodePool: MeshNodePool): void {
    this.nodePool = nodePool;
    logger.info('MeshNodePool attached - multi-node scanning enabled');
  }

  setTriangulationEngine(engine: RealTriangulationEngine): void {
    this.triangulationEngine = engine;
    logger.info('RealTriangulationEngine attached - signal measurements will be forwarded');
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
      
      // Get main router MAC and IP from NVRAM
      const lanMac = (await this.sshClient.execute('nvram get lan_hwaddr')).trim().toLowerCase();
      const lanIp = (await this.sshClient.execute('nvram get lan_ipaddr')).trim();
      
      // Get connected client count from wireless interfaces
      let connectedClients = 0;
      try {
        const assocCount = await this.sshClient.execute('for iface in eth7 eth8 eth9 eth10; do wl -i $iface assoclist 2>/dev/null; done | wc -l');
        connectedClients = parseInt(assocCount.trim(), 10) || 0;
      } catch {
        // Ignore errors, keep 0
      }
      
      const mainNode: MeshNode = {
        id: 'main',
        name: systemInfo['model'] ?? 'Main Router',
        macAddress: lanMac,
        ipAddress: lanIp,
        isMainRouter: true,
        firmwareVersion: systemInfo['firmware'] ?? 'unknown',
        uptime: this.parseUptime(systemInfo['uptime'] ?? '0 0'),
        cpuUsage: this.parseCpuUsage(systemInfo['cpu'] ?? ''),
        memoryUsage: this.parseMemoryUsage(systemInfo['memory'] ?? ''),
        connectedClients,
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

    // Scan wireless clients from ALL mesh nodes if pool is available
    if (this.nodePool) {
      await this.scanWirelessFromAllNodes(devices);
    } else {
      // Fallback: scan only from main router
      await this.scanWirelessFromMain(devices);
    }

    return Array.from(devices.values());
  }

  private async scanWirelessFromMain(devices: Map<string, NetworkDevice>): Promise<void> {
    try {
      const wirelessClients = await this.sshClient.getWirelessClients();
      const macMatches = wirelessClients.match(/([0-9A-Fa-f:]{17})/g) ?? [];
      
      const allSignals = await this.sshClient.getAllClientSignals();
      logger.debug({ signalCount: allSignals.size }, 'Collected client signal strengths from main');

      for (const mac of macMatches) {
        const normalizedMac = normalizeMac(mac);
        if (devices.has(normalizedMac)) {
          const device = devices.get(normalizedMac)!;
          device.connectionType = 'wireless_5g';
          device.connectedToNode = 'main';
          
          const rssi = allSignals.get(normalizedMac);
          if (rssi !== undefined) {
            device.signalStrength = rssi;
            this.recordSignalMeasurement(normalizedMac, 'main', rssi);
            
            // Set status based on signal strength and disconnect history
            if (rssi < -80 || device.disconnectCount > 3) {
              device.status = 'unstable';
            }
          }
        }
      }
    } catch (err) {
      logger.warn({ err }, 'Failed to get wireless clients from main');
    }
  }

  private async scanWirelessFromAllNodes(devices: Map<string, NetworkDevice>): Promise<void> {
    if (!this.nodePool) return;

    const nodes = this.nodePool.getDiscoveredNodes();
    logger.info({ nodeCount: nodes.length }, 'Scanning wireless clients from all mesh nodes');

    for (const node of nodes) {
      try {
        // Get wireless interface names dynamically
        const wl0Ifname = node.isMainRouter 
          ? (await this.nodePool.executeOnNode(node.id, 'nvram get wl0_ifname 2>/dev/null')).trim() || 'eth6'
          : 'eth6';
        const wl1Ifname = node.isMainRouter
          ? (await this.nodePool.executeOnNode(node.id, 'nvram get wl1_ifname 2>/dev/null')).trim() || 'eth7'
          : 'eth7';

        // Get wireless clients from this node (2.4GHz and 5GHz)
        const assocCmd = `wl -i ${wl0Ifname} assoclist 2>/dev/null; wl -i ${wl1Ifname} assoclist 2>/dev/null`;
        const assocOutput = await this.nodePool.executeOnNode(node.id, assocCmd);
        const macMatches = assocOutput.match(/([0-9A-Fa-f:]{17})/g) ?? [];

        // Get signal strengths from this node
        const signalMap = new Map<string, number>();
        for (const iface of [wl0Ifname, wl1Ifname]) {
          try {
            const rssiCmd = `wl -i ${iface} rssi_per_sta 2>/dev/null || for mac in $(wl -i ${iface} assoclist 2>/dev/null | awk '{print $2}'); do echo "$mac $(wl -i ${iface} rssi $mac 2>/dev/null)"; done`;
            const rssiOutput = await this.nodePool.executeOnNode(node.id, rssiCmd);
            
            for (const line of rssiOutput.split('\n')) {
              const match = line.match(/([0-9A-Fa-f:]{17})\s+(-?\d+)/);
              if (match) {
                const mac = normalizeMac(match[1]!);
                const rssi = parseInt(match[2]!, 10);
                if (!isNaN(rssi)) {
                  signalMap.set(mac, rssi);
                }
              }
            }
          } catch {
            // Interface might not exist on this node
          }
        }

        logger.debug({ 
          nodeId: node.id, 
          nodeName: node.name,
          clientCount: macMatches.length,
          signalCount: signalMap.size 
        }, 'Collected wireless clients from node');

        // Update devices with connection info from this node
        for (const mac of macMatches) {
          const normalizedMac = normalizeMac(mac);
          
          if (devices.has(normalizedMac)) {
            const device = devices.get(normalizedMac)!;
            const rssi = signalMap.get(normalizedMac);
            
            // Only update if this node has a stronger signal or device wasn't wireless before
            if (device.connectionType === 'wired' || 
                (rssi !== undefined && (device.signalStrength === undefined || rssi > device.signalStrength))) {
              device.connectionType = 'wireless_5g';
              device.connectedToNode = node.macAddress || node.id;
              
              if (rssi !== undefined) {
                device.signalStrength = rssi;
                this.recordSignalMeasurement(normalizedMac, node.macAddress || node.id, rssi);
                
                // Set status based on signal strength and disconnect history
                if (rssi < -80 || device.disconnectCount > 3) {
                  device.status = 'unstable';
                }
              }
            } else if (rssi !== undefined) {
              // Record measurement even if not the strongest - useful for triangulation
              this.recordSignalMeasurement(normalizedMac, node.macAddress || node.id, rssi);
            }
          }
        }
      } catch (err) {
        logger.warn({ err, nodeId: node.id }, 'Failed to scan wireless clients from node');
      }
    }

    const wirelessCount = Array.from(devices.values()).filter(d => d.connectionType !== 'wired').length;
    logger.info({ wirelessCount, totalDevices: devices.size }, 'Multi-node wireless scan complete');
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

    // Forward to RealTriangulationEngine for position calculation
    if (this.triangulationEngine) {
      this.triangulationEngine.recordSignalMeasurement(deviceMac, nodeMac, rssi);
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
