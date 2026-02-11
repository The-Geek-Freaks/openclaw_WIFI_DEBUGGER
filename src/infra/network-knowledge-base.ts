import { promises as fs } from 'fs';
import path from 'path';
import { createChildLogger } from '../utils/logger.js';
import type { 
  NetworkKnowledge, 
  DeviceProfile, 
  SnmpDeviceProfile, 
  NetworkSnapshot,
  DEFAULT_KNOWLEDGE_SETTINGS 
} from '../types/knowledge-base.js';
import type { NetworkDevice, MeshNode, WifiSettings, ConnectionEvent } from '../types/network.js';
import type { ZigbeeDevice } from '../types/zigbee.js';

const logger = createChildLogger('network-knowledge-base');

export class NetworkKnowledgeBase {
  private readonly dataPath: string;
  private knowledge: NetworkKnowledge | null = null;
  private dirty: boolean = false;
  private autoSaveInterval: NodeJS.Timeout | null = null;

  constructor(dataDir?: string) {
    const baseDir = dataDir ?? process.env['OPENCLAW_DATA_DIR'] ?? './data';
    this.dataPath = path.join(baseDir, 'network-knowledge.json');
  }

  async initialize(): Promise<void> {
    try {
      await fs.mkdir(path.dirname(this.dataPath), { recursive: true });
      
      try {
        const data = await fs.readFile(this.dataPath, 'utf-8');
        this.knowledge = JSON.parse(data) as NetworkKnowledge;
        logger.info({ 
          devices: Object.keys(this.knowledge.devices).length,
          snapshots: this.knowledge.snapshots.length,
        }, 'Loaded existing knowledge base');
      } catch {
        this.knowledge = this.createEmptyKnowledge();
        logger.info('Created new knowledge base');
      }

      this.startAutoSave();
    } catch (err) {
      logger.error({ err }, 'Failed to initialize knowledge base');
      throw err;
    }
  }

  private createEmptyKnowledge(): NetworkKnowledge {
    const now = new Date().toISOString();
    return {
      version: 1,
      createdAt: now,
      updatedAt: now,
      networkId: this.generateNetworkId(),
      devices: {},
      meshNodes: {},
      snmpDevices: {},
      zigbeeDevices: {},
      snapshots: [],
      connectionEvents: [],
      optimizationHistory: [],
      settings: {
        snapshotRetentionDays: 30,
        eventRetentionDays: 7,
        autoSnapshot: true,
        snapshotIntervalHours: 6,
      },
    };
  }

  private generateNetworkId(): string {
    return `net_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`;
  }

  private startAutoSave(): void {
    this.autoSaveInterval = setInterval(() => {
      if (this.dirty) {
        this.save().catch(err => logger.error({ err }, 'Auto-save failed'));
      }
    }, 30000);
  }

  async save(): Promise<void> {
    if (!this.knowledge) return;

    try {
      this.knowledge.updatedAt = new Date().toISOString();
      await fs.writeFile(this.dataPath, JSON.stringify(this.knowledge, null, 2), 'utf-8');
      this.dirty = false;
      logger.debug('Knowledge base saved');
    } catch (err) {
      logger.error({ err }, 'Failed to save knowledge base');
      throw err;
    }
  }

  async shutdown(): Promise<void> {
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
      this.autoSaveInterval = null;
    }
    if (this.dirty) {
      await this.save();
    }
    logger.info('Knowledge base shutdown complete');
  }

  updateDevice(device: NetworkDevice): DeviceProfile {
    if (!this.knowledge) throw new Error('Knowledge base not initialized');

    const now = new Date().toISOString();
    const existing = this.knowledge.devices[device.macAddress];

    if (existing) {
      existing.lastSeen = now;
      if (device.hostname && !existing.hostnames.includes(device.hostname)) {
        existing.hostnames.push(device.hostname);
      }
      if (device.ipAddress && !existing.ipAddresses.includes(device.ipAddress)) {
        existing.ipAddresses.push(device.ipAddress);
      }
      if (device.vendor && !existing.vendor) {
        existing.vendor = device.vendor;
      }
      if (device.signalStrength) {
        existing.avgSignalStrength = existing.avgSignalStrength
          ? (existing.avgSignalStrength + device.signalStrength) / 2
          : device.signalStrength;
      }
      existing.disconnectCount = device.disconnectCount;
      this.dirty = true;
      return existing;
    }

    const profile: DeviceProfile = {
      macAddress: device.macAddress,
      firstSeen: now,
      lastSeen: now,
      hostnames: device.hostname ? [device.hostname] : [],
      ipAddresses: device.ipAddress ? [device.ipAddress] : [],
      vendor: device.vendor,
      avgSignalStrength: device.signalStrength,
      totalConnectionTime: 0,
      disconnectCount: device.disconnectCount,
      isKnown: false,
      tags: [],
    };

    this.knowledge.devices[device.macAddress] = profile;
    this.dirty = true;
    logger.info({ mac: device.macAddress, hostname: device.hostname }, 'New device discovered');
    return profile;
  }

  updateMeshNode(node: MeshNode): void {
    if (!this.knowledge) throw new Error('Knowledge base not initialized');

    const now = new Date().toISOString();
    const existing = this.knowledge.meshNodes[node.macAddress];

    if (existing) {
      existing.lastSeen = now;
      existing.name = node.name;
      existing.ipAddress = node.ipAddress;
      if (node.location) {
        existing.location = node.location;
      }
    } else {
      this.knowledge.meshNodes[node.macAddress] = {
        macAddress: node.macAddress,
        name: node.name,
        ipAddress: node.ipAddress,
        isMainRouter: node.isMainRouter,
        firstSeen: now,
        lastSeen: now,
        location: node.location,
      };
      logger.info({ mac: node.macAddress, name: node.name }, 'New mesh node discovered');
    }
    this.dirty = true;
  }

  updateSnmpDevice(host: string, device: Partial<SnmpDeviceProfile>): void {
    if (!this.knowledge) throw new Error('Knowledge base not initialized');

    const now = new Date().toISOString();
    const existing = this.knowledge.snmpDevices[host];

    if (existing) {
      existing.lastSeen = now;
      Object.assign(existing, device);
    } else {
      this.knowledge.snmpDevices[host] = {
        host,
        port: device.port ?? 161,
        community: device.community ?? 'public',
        deviceType: device.deviceType ?? 'unknown',
        vendor: device.vendor,
        model: device.model,
        location: device.location,
        firstDiscovered: now,
        lastSeen: now,
        portCount: device.portCount,
        vlans: device.vlans,
        notes: device.notes,
      };
      logger.info({ host, type: device.deviceType }, 'New SNMP device discovered');
    }
    this.dirty = true;
  }

  updateZigbeeDevice(device: ZigbeeDevice): void {
    if (!this.knowledge) throw new Error('Knowledge base not initialized');

    const now = new Date().toISOString();
    const existing = this.knowledge.zigbeeDevices[device.ieeeAddress];

    if (existing) {
      existing.lastSeen = now;
      existing.friendlyName = device.friendlyName ?? device.ieeeAddress;
    } else {
      this.knowledge.zigbeeDevices[device.ieeeAddress] = {
        ieeeAddress: device.ieeeAddress,
        friendlyName: device.friendlyName ?? device.ieeeAddress,
        type: device.type,
        manufacturer: device.manufacturer,
        model: device.model,
        firstSeen: now,
        lastSeen: now,
      };
      logger.info({ ieee: device.ieeeAddress, name: device.friendlyName }, 'New Zigbee device discovered');
    }
    this.dirty = true;
  }

  addSnapshot(
    nodes: MeshNode[],
    devices: NetworkDevice[],
    wifiSettings: WifiSettings[],
    healthScore?: number,
    zigbeeChannel?: number,
    zigbeeDeviceCount?: number
  ): void {
    if (!this.knowledge) throw new Error('Knowledge base not initialized');

    const snapshot: NetworkSnapshot = {
      timestamp: new Date().toISOString(),
      meshNodes: nodes.map(n => ({ ...n })),
      wifiSettings: wifiSettings.map(s => ({ ...s })),
      deviceCount: devices.length,
      onlineDevices: devices.filter(d => d.status === 'online').length,
      healthScore,
      zigbeeChannel,
      zigbeeDeviceCount,
    };

    this.knowledge.snapshots.push(snapshot);
    this.pruneSnapshots();
    this.dirty = true;
    logger.info({ devices: devices.length, healthScore }, 'Network snapshot saved');
  }

  addConnectionEvent(event: ConnectionEvent): void {
    if (!this.knowledge) throw new Error('Knowledge base not initialized');

    this.knowledge.connectionEvents.push({
      timestamp: event.timestamp.toISOString(),
      eventType: event.eventType,
      deviceMac: event.deviceMac,
      nodeMac: event.nodeMac,
      details: event.details,
    });

    this.pruneEvents();
    this.dirty = true;
  }

  addOptimizationRecord(
    action: string,
    before: Record<string, unknown>,
    after: Record<string, unknown>,
    result: 'success' | 'failed' | 'reverted'
  ): void {
    if (!this.knowledge) throw new Error('Knowledge base not initialized');

    this.knowledge.optimizationHistory.push({
      timestamp: new Date().toISOString(),
      action,
      before,
      after,
      result,
    });
    this.dirty = true;
    logger.info({ action, result }, 'Optimization recorded');
  }

  private pruneSnapshots(): void {
    if (!this.knowledge) return;

    const cutoff = Date.now() - this.knowledge.settings.snapshotRetentionDays * 24 * 60 * 60 * 1000;
    this.knowledge.snapshots = this.knowledge.snapshots.filter(
      s => new Date(s.timestamp).getTime() > cutoff
    );
  }

  private pruneEvents(): void {
    if (!this.knowledge) return;

    const cutoff = Date.now() - this.knowledge.settings.eventRetentionDays * 24 * 60 * 60 * 1000;
    this.knowledge.connectionEvents = this.knowledge.connectionEvents.filter(
      e => new Date(e.timestamp).getTime() > cutoff
    );
  }

  getDeviceProfile(mac: string): DeviceProfile | undefined {
    return this.knowledge?.devices[mac];
  }

  getAllDevices(): DeviceProfile[] {
    return Object.values(this.knowledge?.devices ?? {});
  }

  getKnownDevices(): DeviceProfile[] {
    return this.getAllDevices().filter(d => d.isKnown);
  }

  getUnknownDevices(): DeviceProfile[] {
    return this.getAllDevices().filter(d => !d.isKnown);
  }

  getMeshNodes(): Array<{ macAddress: string; name: string; ipAddress: string; isMainRouter: boolean }> {
    return Object.values(this.knowledge?.meshNodes ?? {});
  }

  getSnmpDevices(): SnmpDeviceProfile[] {
    return Object.values(this.knowledge?.snmpDevices ?? {});
  }

  getZigbeeDevices(): Array<{ ieeeAddress: string; friendlyName: string; type: string }> {
    return Object.values(this.knowledge?.zigbeeDevices ?? {});
  }

  getSnapshots(limit?: number): NetworkSnapshot[] {
    const snapshots = this.knowledge?.snapshots ?? [];
    return limit ? snapshots.slice(-limit) : snapshots;
  }

  getLastSnapshot(): NetworkSnapshot | undefined {
    return this.knowledge?.snapshots.at(-1);
  }

  markDeviceAsKnown(mac: string, customName?: string, deviceType?: DeviceProfile['deviceType'], notes?: string): boolean {
    const device = this.knowledge?.devices[mac];
    if (!device) return false;

    device.isKnown = true;
    if (customName) device.customName = customName;
    if (deviceType) device.deviceType = deviceType;
    if (notes) device.notes = notes;
    this.dirty = true;
    return true;
  }

  addDeviceTag(mac: string, tag: string): boolean {
    const device = this.knowledge?.devices[mac];
    if (!device) return false;

    if (!device.tags.includes(tag)) {
      device.tags.push(tag);
      this.dirty = true;
    }
    return true;
  }

  getStats(): {
    totalDevices: number;
    knownDevices: number;
    meshNodes: number;
    snmpDevices: number;
    zigbeeDevices: number;
    snapshots: number;
    oldestSnapshot: string | null;
    newestSnapshot: string | null;
  } {
    return {
      totalDevices: Object.keys(this.knowledge?.devices ?? {}).length,
      knownDevices: this.getKnownDevices().length,
      meshNodes: Object.keys(this.knowledge?.meshNodes ?? {}).length,
      snmpDevices: Object.keys(this.knowledge?.snmpDevices ?? {}).length,
      zigbeeDevices: Object.keys(this.knowledge?.zigbeeDevices ?? {}).length,
      snapshots: this.knowledge?.snapshots.length ?? 0,
      oldestSnapshot: this.knowledge?.snapshots[0]?.timestamp ?? null,
      newestSnapshot: this.knowledge?.snapshots.at(-1)?.timestamp ?? null,
    };
  }

  exportKnowledge(): NetworkKnowledge | null {
    return this.knowledge ? { ...this.knowledge } : null;
  }

  setNetworkName(name: string): void {
    if (this.knowledge) {
      this.knowledge.networkName = name;
      this.dirty = true;
    }
  }
}
