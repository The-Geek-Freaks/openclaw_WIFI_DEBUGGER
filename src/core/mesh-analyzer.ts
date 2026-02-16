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
      
      // Get main router MAC and IP from NVRAM
      const lanMac = (await this.sshClient.execute('nvram get lan_hwaddr')).trim().toLowerCase();
      const lanIp = (await this.sshClient.execute('nvram get lan_ipaddr')).trim();
      
      // Get connected client count from wireless interfaces (dynamically detected)
      let connectedClients = 0;
      try {
        const detectedInterfaces = this.sshClient.getDetectedInterfaces();
        const interfaces = [
          detectedInterfaces.wl0,
          detectedInterfaces.wl1,
          detectedInterfaces.wl2,
          detectedInterfaces.wl3,
        ].filter(Boolean);
        
        if (interfaces.length > 0) {
          const ifaceCmd = interfaces.map(iface => `wl -i ${iface} assoclist 2>/dev/null`).join('; ');
          const assocCount = await this.sshClient.execute(`(${ifaceCmd}) | wc -l`);
          connectedClients = parseInt(assocCount.trim(), 10) || 0;
        }
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
        
        // F3 Fix: Get cfg_cost to determine backhaul type (0 = wired, >0 = wireless)
        let cfgCost: Record<string, number> = {};
        try {
          const cfgCostRaw = await this.sshClient.execute('nvram get cfg_cost');
          // cfg_cost format: <MAC>cost> or MAC1>cost1<MAC2>cost2
          const costEntries = cfgCostRaw.split('<').filter(Boolean);
          for (const costEntry of costEntries) {
            const [costMac, cost] = costEntry.split('>');
            if (costMac && cost !== undefined) {
              cfgCost[normalizeMac(costMac)] = parseInt(cost, 10) || 999;
            }
          }
        } catch {
          // cfg_cost not available on all firmware versions
        }
        
        // cfg_clientlist format: <MAC>IP>model>alias
        // Parse each entry consistently
        for (const entry of meshEntries) {
          const parts = entry.split('>');
          if (parts.length >= 2) {
            // cfg_clientlist: MAC>IP>model>alias
            const mac = normalizeMac(parts[0] ?? '');
            const ip = parts[1] ?? '';
            const model = parts[2] ?? '';
            const alias = parts[3] ?? '';
            
            // Skip if MAC is too short (truncated)
            if (mac.length < 17) {
              logger.warn({ mac, entry }, 'Skipping truncated MAC address');
              continue;
            }
            
            const nodeName = alias || model || ip || `AiMesh Node ${mac}`;
            
            // F3 Fix: Determine backhaul type from cfg_cost
            // Cost 0 = wired backhaul, Cost > 0 = wireless backhaul
            const cost = cfgCost[mac];
            const backhaulType: 'wired' | 'mesh_backhaul' = cost === 0 ? 'wired' : 'mesh_backhaul';
            
            logger.debug({ 
              mac, ip, model, alias, cost, backhaulType, partsCount: parts.length 
            }, 'Parsed mesh node entry (cfg_clientlist)');
            
            nodes.push({
              id: mac,
              name: nodeName,
              macAddress: mac,
              ipAddress: ip,
              isMainRouter: false,
              firmwareVersion: 'unknown',
              uptime: 0,
              cpuUsage: 0,
              memoryUsage: 0,
              connectedClients: 0,
              backhaulType,
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
      // Get clients with proper band detection
      const clientsByBand = await this.sshClient.getWirelessClientsByBand();
      const allSignals = await this.sshClient.getAllClientSignals();
      
      logger.debug({ 
        clientCount: clientsByBand.size, 
        signalCount: allSignals.size 
      }, 'Collected wireless clients with band info from main');

      for (const [mac, band] of clientsByBand) {
        const normalizedMac = normalizeMac(mac);
        if (devices.has(normalizedMac)) {
          const device = devices.get(normalizedMac)!;
          device.connectionType = band; // Now properly set to wireless_2g, wireless_5g, etc.
          device.connectedToNode = 'main';
          
          const rssi = allSignals.get(normalizedMac);
          if (rssi !== undefined) {
            device.signalStrength = rssi;
            this.recordSignalMeasurement(normalizedMac, 'main', rssi, band);
            
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
        // Get wireless interface names dynamically for ALL nodes (including satellites)
        const wl0Ifname = (await this.nodePool.executeOnNode(node.id, 'nvram get wl0_ifname 2>/dev/null')).trim() || 'eth6';
        const wl1Ifname = (await this.nodePool.executeOnNode(node.id, 'nvram get wl1_ifname 2>/dev/null')).trim() || 'eth7';
        const wl2Ifname = (await this.nodePool.executeOnNode(node.id, 'nvram get wl2_ifname 2>/dev/null')).trim();
        const wl3Ifname = (await this.nodePool.executeOnNode(node.id, 'nvram get wl3_ifname 2>/dev/null')).trim();

        // Build interface list with band mapping
        const interfaceBands: Array<{ iface: string; band: 'wireless_2g' | 'wireless_5g' | 'wireless_6g' }> = [
          { iface: wl0Ifname, band: 'wireless_2g' },
          { iface: wl1Ifname, band: 'wireless_5g' },
        ];
        if (wl2Ifname) interfaceBands.push({ iface: wl2Ifname, band: 'wireless_5g' });
        if (wl3Ifname) interfaceBands.push({ iface: wl3Ifname, band: 'wireless_6g' });

        // Get wireless clients from this node (all bands)
        const assocCmd = interfaceBands.map(ib => `wl -i ${ib.iface} assoclist 2>/dev/null`).join('; ');
        const assocOutput = await this.nodePool.executeOnNode(node.id, assocCmd);
        const macMatches = assocOutput.match(/([0-9A-Fa-f:]{17})/g) ?? [];

        // Get signal strengths and band info from this node
        const signalMap = new Map<string, { rssi: number; band: 'wireless_2g' | 'wireless_5g' | 'wireless_6g' }>();
        for (const { iface, band } of interfaceBands) {
          try {
            const rssiCmd = `wl -i ${iface} rssi_per_sta 2>/dev/null || for mac in $(wl -i ${iface} assoclist 2>/dev/null | awk '{print $2}'); do echo "$mac $(wl -i ${iface} rssi $mac 2>/dev/null)"; done`;
            const rssiOutput = await this.nodePool.executeOnNode(node.id, rssiCmd);
            
            for (const line of rssiOutput.split('\n')) {
              const match = line.match(/([0-9A-Fa-f:]{17})\s+(-?\d+)/);
              if (match) {
                const mac = normalizeMac(match[1]!);
                const rssi = parseInt(match[2]!, 10);
                if (!isNaN(rssi)) {
                  signalMap.set(mac, { rssi, band });
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
            const signalInfo = signalMap.get(normalizedMac);
            const rssi = signalInfo?.rssi;
            const band = signalInfo?.band ?? 'wireless_5g';
            
            // Only update if this node has a stronger signal or device wasn't wireless before
            if (device.connectionType === 'wired' || 
                (rssi !== undefined && (device.signalStrength === undefined || rssi > device.signalStrength))) {
              device.connectionType = band;
              device.connectedToNode = node.macAddress || node.id;
              
              if (rssi !== undefined) {
                device.signalStrength = rssi;
                this.recordSignalMeasurement(normalizedMac, node.macAddress || node.id, rssi, band);
                
                // Set status based on signal strength and disconnect history
                if (rssi < -80 || device.disconnectCount > 3) {
                  device.status = 'unstable';
                }
              }
            } else if (rssi !== undefined) {
              // Record measurement even if not the strongest - useful for triangulation
              this.recordSignalMeasurement(normalizedMac, node.macAddress || node.id, rssi, band);
            }
          }
        }
      } catch (err) {
        logger.warn({ err, nodeId: node.id }, 'Failed to scan wireless clients from node');
      }
    }

    const wirelessCount = Array.from(devices.values()).filter(d => d.connectionType !== 'wired').length;
    logger.info({ wirelessCount, totalDevices: devices.size }, 'Multi-node wireless scan complete');

    // CRITICAL: Cross-node RSSI measurement for triangulation
    // Each node must try to measure RSSI for ALL known wireless devices, not just connected ones
    await this.collectCrossNodeSignals(devices, nodes);
  }

  /**
   * Collect RSSI measurements from ALL nodes for ALL known wireless devices.
   * This enables true triangulation - a device connected to Node B can still be
   * measured by Node A and Node C if it's in radio range.
   */
  private async collectCrossNodeSignals(
    devices: Map<string, NetworkDevice>,
    nodes: Array<{ id: string; macAddress?: string; isMainRouter: boolean }>
  ): Promise<void> {
    if (!this.nodePool) return;

    // Get all wireless device MACs
    const wirelessMacs = Array.from(devices.values())
      .filter(d => d.connectionType !== 'wired')
      .map(d => d.macAddress);

    if (wirelessMacs.length === 0) {
      logger.debug('No wireless devices to measure cross-node signals');
      return;
    }

    logger.info({ 
      deviceCount: wirelessMacs.length, 
      nodeCount: nodes.length 
    }, 'Collecting cross-node signals for triangulation');

    for (const node of nodes) {
      try {
        // Get interface names for this node
        const wl0 = (await this.nodePool.executeOnNode(node.id, 'nvram get wl0_ifname 2>/dev/null')).trim() || 'eth6';
        const wl1 = (await this.nodePool.executeOnNode(node.id, 'nvram get wl1_ifname 2>/dev/null')).trim() || 'eth7';
        const interfaces = [wl0, wl1].filter(Boolean);

        // For each wireless device, try to get RSSI from this node
        for (const mac of wirelessMacs) {
          // Skip if we already have a recent measurement from this node
          const key = `${mac}:${node.macAddress || node.id}`;
          const existing = this.signalHistory.get(key);
          if (existing && existing.length > 0) {
            const lastMeasurement = existing[existing.length - 1];
            if (lastMeasurement && Date.now() - lastMeasurement.timestamp.getTime() < 60000) {
              continue; // Skip if we have a measurement less than 1 minute old
            }
          }

          // Try each interface
          for (const iface of interfaces) {
            try {
              const rssiOutput = await this.nodePool.executeOnNode(
                node.id,
                `wl -i ${iface} rssi ${mac.toUpperCase().replace(/:/g, ':')} 2>/dev/null`
              );
              const rssi = parseInt(rssiOutput.trim(), 10);
              
              if (!isNaN(rssi) && rssi < 0 && rssi > -100) {
                this.recordSignalMeasurement(mac, node.macAddress || node.id, rssi);
                logger.debug({ 
                  mac, 
                  node: node.id, 
                  iface, 
                  rssi 
                }, 'Cross-node signal measurement');
                break; // Got a valid measurement, no need to try other interfaces
              }
            } catch {
              // Device not in range of this interface - expected
            }
          }
        }
      } catch (err) {
        logger.warn({ err, nodeId: node.id }, 'Failed to collect cross-node signals');
      }
    }

    // Log triangulation potential
    const measurementCounts = new Map<string, number>();
    for (const mac of wirelessMacs) {
      let count = 0;
      for (const node of nodes) {
        const key = `${mac}:${node.macAddress || node.id}`;
        if (this.signalHistory.has(key)) count++;
      }
      measurementCounts.set(mac, count);
    }

    const canTrilaterate = Array.from(measurementCounts.values()).filter(c => c >= 3).length;
    const canBilaterate = Array.from(measurementCounts.values()).filter(c => c === 2).length;
    
    logger.info({ 
      canTrilaterate, 
      canBilaterate,
      singleNodeOnly: wirelessMacs.length - canTrilaterate - canBilaterate
    }, 'Triangulation potential after cross-node measurement');
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

      const parseBoolean = (val: string | undefined): boolean => {
        return val === '1' || val === 'on' || val === 'enabled';
      };

      const parseSecurityMode = (authMode: string | undefined, crypto: string | undefined, mfp: string | undefined): string => {
        const auth = authMode ?? '';
        const enc = crypto ?? '';
        const pmf = mfp ?? '0';
        
        if (auth.includes('wpa3') || auth === 'sae' || pmf === '2') return 'WPA3';
        if (auth.includes('wpa2') || auth === 'psk2') {
          return pmf === '1' ? 'WPA2/WPA3' : 'WPA2';
        }
        if (auth.includes('wpa') || auth === 'psk') return 'WPA';
        if (auth === 'open') return 'Open';
        return enc ? 'WPA2' : 'Unknown';
      };

      settings.push({
        ssid: nvram['wl0_ssid'] ?? '',
        band: '2.4GHz',
        channel: parseChannel(nvram['wl0_channel']),
        channelWidth: parseBandwidth(nvram['wl0_bw'], 20),
        txPower: parseChannel(nvram['wl0_txpower']) || 100,
        standard: parseBoolean(nvram['wl0_11ax']) ? '802.11ax' : '802.11ac',
        security: parseSecurityMode(nvram['wl0_auth_mode_x'], nvram['wl0_crypto'], nvram['wl0_mfp']),
        bandSteering: nvram['wl0_bsd_steering_policy'] !== '0' && nvram['wl0_bsd_steering_policy'] !== '',
        smartConnect: nvram['smart_connect_x'] === '1',
        roamingAssistant: parseBoolean(nvram['wl0_rast']),
        beamforming: parseBoolean(nvram['wl0_txbf']) || parseBoolean(nvram['wl0_itxbf']),
        muMimo: parseBoolean(nvram['wl0_mumimo']),
        ofdma: parseBoolean(nvram['wl0_ofdma']),
      });

      settings.push({
        ssid: nvram['wl1_ssid'] ?? '',
        band: '5GHz',
        channel: parseChannel(nvram['wl1_channel']),
        channelWidth: parseBandwidth(nvram['wl1_bw'], 80),
        txPower: parseChannel(nvram['wl1_txpower']) || 100,
        standard: parseBoolean(nvram['wl1_11ax']) ? '802.11ax' : '802.11ac',
        security: parseSecurityMode(nvram['wl1_auth_mode_x'], nvram['wl1_crypto'], nvram['wl1_mfp']),
        bandSteering: nvram['wl1_bsd_steering_policy'] !== '0' && nvram['wl1_bsd_steering_policy'] !== '',
        smartConnect: nvram['smart_connect_x'] === '1',
        roamingAssistant: parseBoolean(nvram['wl1_rast']),
        beamforming: parseBoolean(nvram['wl1_txbf']) || parseBoolean(nvram['wl1_itxbf']),
        muMimo: parseBoolean(nvram['wl1_mumimo']),
        ofdma: parseBoolean(nvram['wl1_ofdma']),
      });

      if (nvram['wl2_ssid'] && nvram['wl2_ssid'].trim() !== '') {
        settings.push({
          ssid: nvram['wl2_ssid'],
          band: '5GHz-2',
          channel: parseChannel(nvram['wl2_channel']),
          channelWidth: parseBandwidth(nvram['wl2_bw'], 80),
          txPower: parseChannel(nvram['wl2_txpower']) || 100,
          standard: '802.11ax',
          security: parseSecurityMode(nvram['wl2_auth_mode_x'], nvram['wl2_crypto'], undefined),
          bandSteering: nvram['wl2_bsd_steering_policy'] !== '0' && nvram['wl2_bsd_steering_policy'] !== '',
          smartConnect: nvram['smart_connect_x'] === '1',
          roamingAssistant: parseBoolean(nvram['wl2_rast']),
          beamforming: parseBoolean(nvram['wl2_txbf']) || parseBoolean(nvram['wl2_itxbf']),
          muMimo: parseBoolean(nvram['wl2_mumimo']),
          ofdma: parseBoolean(nvram['wl2_ofdma']),
        });
      }

      // A9 Fix: Add 6GHz band support (wl3)
      if (nvram['wl3_ssid'] && nvram['wl3_ssid'].trim() !== '') {
        settings.push({
          ssid: nvram['wl3_ssid'],
          band: '6GHz',
          channel: parseChannel(nvram['wl3_channel']),
          channelWidth: parseBandwidth(nvram['wl3_bw'], 160),
          txPower: parseChannel(nvram['wl3_txpower']) || 100,
          standard: '802.11ax',
          security: parseSecurityMode(nvram['wl3_auth_mode_x'], nvram['wl3_crypto'], nvram['wl3_mfp']),
          bandSteering: nvram['wl3_bsd_steering_policy'] !== '0' && nvram['wl3_bsd_steering_policy'] !== '',
          smartConnect: nvram['smart_connect_x'] === '1',
          roamingAssistant: parseBoolean(nvram['wl3_rast']),
          beamforming: parseBoolean(nvram['wl3_txbf']) || parseBoolean(nvram['wl3_itxbf']),
          muMimo: parseBoolean(nvram['wl3_mumimo']),
          ofdma: parseBoolean(nvram['wl3_ofdma']),
        });
      }
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

  private recordSignalMeasurement(
    deviceMac: string, 
    nodeMac: string, 
    rssi: number,
    band?: 'wireless_2g' | 'wireless_5g' | 'wireless_6g',
    txRate?: number,
    rxRate?: number
  ): void {
    const key = `${deviceMac}:${nodeMac}`;
    let history = this.signalHistory.get(key);
    
    if (!history) {
      history = [];
      this.signalHistory.set(key, history);
    }

    // A6 Fix: Derive channel and channelWidth from cached WifiSettings based on band
    let channel = 0;
    let channelWidth = 0;
    if (band && this.currentState?.wifiSettings) {
      const bandMap: Record<string, '2.4GHz' | '5GHz' | '5GHz-2' | '6GHz'> = {
        'wireless_2g': '2.4GHz',
        'wireless_5g': '5GHz',
        'wireless_6g': '6GHz',
      };
      const wifiBand = bandMap[band];
      const settings = this.currentState.wifiSettings.find(s => s.band === wifiBand);
      if (settings) {
        channel = settings.channel;
        channelWidth = settings.channelWidth;
      }
    }

    history.push({
      timestamp: new Date(),
      deviceMac,
      nodeMac,
      rssi,
      channel,
      channelWidth,
      txRate: txRate ?? 0,
      rxRate: rxRate ?? 0,
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
