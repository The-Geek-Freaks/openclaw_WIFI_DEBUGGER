import { createChildLogger } from '../utils/logger.js';
import { 
  SnmpClient, 
  SnmpDeviceInfo, 
  MikroTikHealthData,
  STANDARD_OIDS,
  MIKROTIK_OIDS 
} from '../infra/snmp-client.js';

const logger = createChildLogger('network-topology');

export const OPNSENSE_OIDS = {
  pfStateCount: '1.3.6.1.4.1.12325.1.200.1.3.1.0',
  pfStateSearches: '1.3.6.1.4.1.12325.1.200.1.3.2.0',
  pfStateInserts: '1.3.6.1.4.1.12325.1.200.1.3.3.0',
  pfStateRemovals: '1.3.6.1.4.1.12325.1.200.1.3.4.0',
  
  pfCounterMatch: '1.3.6.1.4.1.12325.1.200.1.2.1.0',
  pfCounterBadOffset: '1.3.6.1.4.1.12325.1.200.1.2.2.0',
  pfCounterFragment: '1.3.6.1.4.1.12325.1.200.1.2.3.0',
  pfCounterShort: '1.3.6.1.4.1.12325.1.200.1.2.4.0',
  pfCounterNormalize: '1.3.6.1.4.1.12325.1.200.1.2.5.0',
  pfCounterMemDrop: '1.3.6.1.4.1.12325.1.200.1.2.6.0',
} as const;

export interface SnmpNetworkDevice {
  id: string;
  name: string;
  type: 'router' | 'switch' | 'firewall' | 'ap' | 'unknown';
  vendor: string;
  ipAddress: string;
  snmpAvailable: boolean;
  interfaces: NetworkInterface[];
  health?: DeviceHealth;
  lastSeen: Date;
}

export interface NetworkInterface {
  index: number;
  name: string;
  type: 'ethernet' | 'wifi' | 'vlan' | 'bridge' | 'tunnel' | 'loopback' | 'other';
  speed: number;
  status: 'up' | 'down' | 'unknown';
  macAddress?: string;
  ipAddress?: string;
  traffic: InterfaceTraffic;
  errors: InterfaceErrors;
}

export interface InterfaceTraffic {
  rxBytes: number;
  txBytes: number;
  rxPackets: number;
  txPackets: number;
  rxBytesPerSec: number;
  txBytesPerSec: number;
  utilization: number;
}

export interface InterfaceErrors {
  rxErrors: number;
  txErrors: number;
  rxDrops: number;
  txDrops: number;
  collisions: number;
  errorRate: number;
}

export interface DeviceHealth {
  cpuUsage?: number | undefined;
  memoryUsage?: number | undefined;
  temperature?: number | undefined;
  uptime: number;
  stateTableUsage?: number | undefined;
}

export interface NetworkLink {
  sourceDevice: string;
  sourceInterface: string;
  targetDevice: string;
  targetInterface: string;
  linkType: 'ethernet' | 'fiber' | 'wireless' | 'virtual';
  speed: number;
  status: 'up' | 'down' | 'degraded';
  latency?: number;
}

export interface TrafficBottleneck {
  deviceId: string;
  interfaceName: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  type: 'bandwidth' | 'errors' | 'drops' | 'latency' | 'cpu' | 'memory' | 'state_table';
  currentValue: number;
  threshold: number;
  impact: string;
  recommendation: string;
}

export interface ProblemDevice {
  deviceId: string;
  deviceName: string;
  problems: Array<{
    type: string;
    severity: 'warning' | 'critical';
    description: string;
    affectedInterfaces?: string[] | undefined;
    recommendation: string;
  }>;
  overallHealth: number;
}

export interface NetworkTopology {
  timestamp: Date;
  devices: SnmpNetworkDevice[];
  links: NetworkLink[];
  bottlenecks: TrafficBottleneck[];
  problemDevices: ProblemDevice[];
  overallHealthScore: number;
  recommendations: string[];
}

export class NetworkTopologyAnalyzer {
  private readonly snmpClient: SnmpClient;
  private previousTraffic: Map<string, { rx: number; tx: number; time: number }> = new Map();
  private deviceCache: Map<string, SnmpNetworkDevice> = new Map();

  constructor(snmpClient: SnmpClient) {
    this.snmpClient = snmpClient;
  }

  async discoverTopology(): Promise<NetworkTopology> {
    logger.info('Starting network topology discovery');

    const devices = await this.discoverDevices();
    const links = await this.discoverLinks(devices);
    const bottlenecks = this.detectBottlenecks(devices);
    const problemDevices = this.identifyProblemDevices(devices, bottlenecks);
    const overallHealth = this.calculateOverallHealth(devices, bottlenecks);
    const recommendations = this.generateRecommendations(bottlenecks, problemDevices);

    logger.info({ 
      deviceCount: devices.length, 
      linkCount: links.length,
      bottleneckCount: bottlenecks.length,
      problemCount: problemDevices.length 
    }, 'Topology discovery complete');

    return {
      timestamp: new Date(),
      devices,
      links,
      bottlenecks,
      problemDevices,
      overallHealthScore: overallHealth,
      recommendations,
    };
  }

  private async discoverDevices(): Promise<SnmpNetworkDevice[]> {
    const devices: SnmpNetworkDevice[] = [];
    const snmpDevices = this.snmpClient.getConfiguredDevices();

    for (const config of snmpDevices) {
      try {
        const info = await this.snmpClient['getDeviceInfo'](config.host, config.port);
        if (!info) continue;

        const device: SnmpNetworkDevice = {
          id: config.host,
          name: info.sysName,
          type: this.detectDeviceType(info),
          vendor: info.vendor ?? 'Unknown',
          ipAddress: config.host,
          snmpAvailable: true,
          interfaces: [],
          lastSeen: new Date(),
        };

        device.health = await this.getDeviceHealth(config.host, config.port ?? 161, device.type, device.vendor);

        this.deviceCache.set(config.host, device);
        devices.push(device);
      } catch (err) {
        logger.warn({ err, host: config.host }, 'Failed to discover device');
      }
    }

    return devices;
  }

  private detectDeviceType(info: SnmpDeviceInfo): SnmpNetworkDevice['type'] {
    const descr = info.sysDescr.toLowerCase();
    
    if (descr.includes('opnsense') || descr.includes('pfsense') || descr.includes('firewall')) {
      return 'firewall';
    }
    if (descr.includes('routeros') || descr.includes('router') || descr.includes('cisco ios')) {
      return 'router';
    }
    if (descr.includes('swos') || descr.includes('switch') || descr.includes('catalyst')) {
      return 'switch';
    }
    if (descr.includes('unifi') || descr.includes('access point') || descr.includes('wap')) {
      return 'ap';
    }
    
    return 'unknown';
  }

  private async getDeviceHealth(
    host: string, 
    port: number, 
    _type: SnmpNetworkDevice['type'],
    vendor: string
  ): Promise<DeviceHealth> {
    const health: DeviceHealth = { uptime: 0 };

    if (vendor === 'MikroTik') {
      const mtHealth = await this.snmpClient['getMikroTikHealth'](host, port);
      if (mtHealth) {
        health.cpuUsage = mtHealth.cpuLoad;
        health.temperature = mtHealth.temperature;
      }
    }

    return health;
  }

  private async discoverLinks(devices: SnmpNetworkDevice[]): Promise<NetworkLink[]> {
    const links: NetworkLink[] = [];

    for (let i = 0; i < devices.length; i++) {
      for (let j = i + 1; j < devices.length; j++) {
        const link: NetworkLink = {
          sourceDevice: devices[i]!.id,
          sourceInterface: 'auto',
          targetDevice: devices[j]!.id,
          targetInterface: 'auto',
          linkType: 'ethernet',
          speed: 1000,
          status: 'up',
        };
        links.push(link);
      }
    }

    return links;
  }

  private detectBottlenecks(devices: SnmpNetworkDevice[]): TrafficBottleneck[] {
    const bottlenecks: TrafficBottleneck[] = [];

    for (const device of devices) {
      if (device.health?.cpuUsage && device.health.cpuUsage > 80) {
        bottlenecks.push({
          deviceId: device.id,
          interfaceName: 'CPU',
          severity: device.health.cpuUsage > 95 ? 'critical' : 'high',
          type: 'cpu',
          currentValue: device.health.cpuUsage,
          threshold: 80,
          impact: 'Packet processing delays, increased latency',
          recommendation: 'Check traffic load, consider hardware upgrade or load balancing',
        });
      }

      if (device.health?.memoryUsage && device.health.memoryUsage > 85) {
        bottlenecks.push({
          deviceId: device.id,
          interfaceName: 'Memory',
          severity: device.health.memoryUsage > 95 ? 'critical' : 'high',
          type: 'memory',
          currentValue: device.health.memoryUsage,
          threshold: 85,
          impact: 'Connection drops, service failures',
          recommendation: 'Reduce active connections or increase memory',
        });
      }

      if (device.health?.stateTableUsage && device.health.stateTableUsage > 75) {
        bottlenecks.push({
          deviceId: device.id,
          interfaceName: 'State Table',
          severity: device.health.stateTableUsage > 90 ? 'critical' : 'high',
          type: 'state_table',
          currentValue: device.health.stateTableUsage,
          threshold: 75,
          impact: 'New connections may be dropped',
          recommendation: 'Increase state table limit or reduce active connections',
        });
      }

      if (device.health?.temperature && device.health.temperature > 70) {
        bottlenecks.push({
          deviceId: device.id,
          interfaceName: 'Thermal',
          severity: device.health.temperature > 85 ? 'critical' : 'medium',
          type: 'cpu',
          currentValue: device.health.temperature,
          threshold: 70,
          impact: 'Thermal throttling, reduced performance',
          recommendation: 'Improve cooling or reduce load',
        });
      }

      for (const iface of device.interfaces) {
        if (iface.traffic.utilization > 80) {
          bottlenecks.push({
            deviceId: device.id,
            interfaceName: iface.name,
            severity: iface.traffic.utilization > 95 ? 'critical' : 'high',
            type: 'bandwidth',
            currentValue: iface.traffic.utilization,
            threshold: 80,
            impact: `Interface ${iface.name} near saturation`,
            recommendation: 'Upgrade link speed or implement QoS',
          });
        }

        if (iface.errors.errorRate > 0.1) {
          bottlenecks.push({
            deviceId: device.id,
            interfaceName: iface.name,
            severity: iface.errors.errorRate > 1 ? 'critical' : 'medium',
            type: 'errors',
            currentValue: iface.errors.errorRate,
            threshold: 0.1,
            impact: 'Packet loss, retransmissions',
            recommendation: 'Check cable, port, or NIC for issues',
          });
        }
      }
    }

    return bottlenecks;
  }

  private identifyProblemDevices(
    devices: SnmpNetworkDevice[], 
    bottlenecks: TrafficBottleneck[]
  ): ProblemDevice[] {
    const problemDevices: ProblemDevice[] = [];
    const deviceBottlenecks = new Map<string, TrafficBottleneck[]>();

    for (const bn of bottlenecks) {
      if (!deviceBottlenecks.has(bn.deviceId)) {
        deviceBottlenecks.set(bn.deviceId, []);
      }
      deviceBottlenecks.get(bn.deviceId)!.push(bn);
    }

    for (const device of devices) {
      const bns = deviceBottlenecks.get(device.id) ?? [];
      if (bns.length === 0) continue;

      const problems = bns.map(bn => ({
        type: bn.type,
        severity: bn.severity === 'critical' || bn.severity === 'high' ? 'critical' as const : 'warning' as const,
        description: `${bn.type}: ${bn.currentValue}% (threshold: ${bn.threshold}%)`,
        affectedInterfaces: bn.interfaceName !== 'CPU' && bn.interfaceName !== 'Memory' 
          ? [bn.interfaceName] 
          : undefined,
        recommendation: bn.recommendation,
      }));

      const criticalCount = problems.filter(p => p.severity === 'critical').length;
      const health = Math.max(0, 100 - (criticalCount * 30) - (problems.length * 10));

      problemDevices.push({
        deviceId: device.id,
        deviceName: device.name,
        problems,
        overallHealth: health,
      });
    }

    return problemDevices.sort((a, b) => a.overallHealth - b.overallHealth);
  }

  private calculateOverallHealth(
    devices: SnmpNetworkDevice[], 
    bottlenecks: TrafficBottleneck[]
  ): number {
    if (devices.length === 0) return 100;

    let score = 100;

    const criticalCount = bottlenecks.filter(b => b.severity === 'critical').length;
    const highCount = bottlenecks.filter(b => b.severity === 'high').length;
    const mediumCount = bottlenecks.filter(b => b.severity === 'medium').length;

    score -= criticalCount * 15;
    score -= highCount * 8;
    score -= mediumCount * 3;

    const unreachable = devices.filter(d => !d.snmpAvailable).length;
    score -= unreachable * 10;

    return Math.max(0, Math.min(100, score));
  }

  private generateRecommendations(
    bottlenecks: TrafficBottleneck[],
    problemDevices: ProblemDevice[]
  ): string[] {
    const recommendations: string[] = [];

    const criticalDevices = problemDevices.filter(d => d.overallHealth < 50);
    if (criticalDevices.length > 0) {
      recommendations.push(
        `🚨 ${criticalDevices.length} Geräte in kritischem Zustand: ${criticalDevices.map(d => d.deviceName).join(', ')}`
      );
    }

    const cpuBottlenecks = bottlenecks.filter(b => b.type === 'cpu' && b.severity === 'critical');
    if (cpuBottlenecks.length > 0) {
      recommendations.push(
        `⚡ CPU-Überlastung auf ${cpuBottlenecks.length} Geräten. Traffic-Verteilung oder Hardware-Upgrade prüfen.`
      );
    }

    const bwBottlenecks = bottlenecks.filter(b => b.type === 'bandwidth');
    if (bwBottlenecks.length > 0) {
      recommendations.push(
        `📊 ${bwBottlenecks.length} Interfaces mit hoher Auslastung. Link-Aggregation oder Upgrade auf schnellere Links erwägen.`
      );
    }

    const errorBottlenecks = bottlenecks.filter(b => b.type === 'errors');
    if (errorBottlenecks.length > 0) {
      recommendations.push(
        `⚠️ ${errorBottlenecks.length} Interfaces mit Fehlern. Kabel, Ports und NICs prüfen.`
      );
    }

    const stateBottlenecks = bottlenecks.filter(b => b.type === 'state_table');
    if (stateBottlenecks.length > 0) {
      recommendations.push(
        `🔥 State-Table-Limits erreicht. Firewall-Tuning oder zusätzliche Kapazität erforderlich.`
      );
    }

    if (recommendations.length === 0) {
      recommendations.push('✅ Keine kritischen Probleme erkannt. Netzwerk läuft stabil.');
    }

    return recommendations;
  }

  getDeviceById(id: string): SnmpNetworkDevice | undefined {
    return this.deviceCache.get(id);
  }

  exportTopologyForVisualization(topology: NetworkTopology): {
    nodes: Array<{ id: string; label: string; type: string; health: number }>;
    edges: Array<{ from: string; to: string; status: string }>;
  } {
    return {
      nodes: topology.devices.map(d => ({
        id: d.id,
        label: d.name,
        type: d.type,
        health: topology.problemDevices.find(p => p.deviceId === d.id)?.overallHealth ?? 100,
      })),
      edges: topology.links.map(l => ({
        from: l.sourceDevice,
        to: l.targetDevice,
        status: l.status,
      })),
    };
  }
}
