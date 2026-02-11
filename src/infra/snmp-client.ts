import { createChildLogger } from '../utils/logger.js';
import { withTimeout } from '../utils/async-helpers.js';

const logger = createChildLogger('snmp-client');

const SNMP_TIMEOUT = 5000;

export const STANDARD_OIDS = {
  sysDescr: '1.3.6.1.2.1.1.1.0',
  sysObjectID: '1.3.6.1.2.1.1.2.0',
  sysUpTime: '1.3.6.1.2.1.1.3.0',
  sysContact: '1.3.6.1.2.1.1.4.0',
  sysName: '1.3.6.1.2.1.1.5.0',
  sysLocation: '1.3.6.1.2.1.1.6.0',

  ifNumber: '1.3.6.1.2.1.2.1.0',
  ifTable: '1.3.6.1.2.1.2.2',
  ifDescr: '1.3.6.1.2.1.2.2.1.2',
  ifType: '1.3.6.1.2.1.2.2.1.3',
  ifMtu: '1.3.6.1.2.1.2.2.1.4',
  ifSpeed: '1.3.6.1.2.1.2.2.1.5',
  ifPhysAddress: '1.3.6.1.2.1.2.2.1.6',
  ifAdminStatus: '1.3.6.1.2.1.2.2.1.7',
  ifOperStatus: '1.3.6.1.2.1.2.2.1.8',
  ifInOctets: '1.3.6.1.2.1.2.2.1.10',
  ifInUcastPkts: '1.3.6.1.2.1.2.2.1.11',
  ifInErrors: '1.3.6.1.2.1.2.2.1.14',
  ifOutOctets: '1.3.6.1.2.1.2.2.1.16',
  ifOutUcastPkts: '1.3.6.1.2.1.2.2.1.17',
  ifOutErrors: '1.3.6.1.2.1.2.2.1.20',

  ipAddrTable: '1.3.6.1.2.1.4.20',
  ipRouteTable: '1.3.6.1.2.1.4.21',

  dot1dTpFdbTable: '1.3.6.1.2.1.17.4.3',
  dot1dTpFdbAddress: '1.3.6.1.2.1.17.4.3.1.1',
  dot1dTpFdbPort: '1.3.6.1.2.1.17.4.3.1.2',
} as const;

export const MIKROTIK_OIDS = {
  mtxrHlTemperature: '1.3.6.1.4.1.14988.1.1.3.10.0',
  mtxrHlProcessorTemperature: '1.3.6.1.4.1.14988.1.1.3.11.0',
  mtxrHlCpuLoad: '1.3.6.1.4.1.14988.1.1.3.14.0',
  mtxrHlActiveFan: '1.3.6.1.4.1.14988.1.1.3.9.0',
  mtxrHlVoltage: '1.3.6.1.4.1.14988.1.1.3.8.0',
  mtxrHlCurrent: '1.3.6.1.4.1.14988.1.1.3.13.0',
  mtxrHlPower: '1.3.6.1.4.1.14988.1.1.3.12.0',

  mtxrWlApTable: '1.3.6.1.4.1.14988.1.1.1.3',
  mtxrWlStatTable: '1.3.6.1.4.1.14988.1.1.1.1',
  mtxrWlRtabTable: '1.3.6.1.4.1.14988.1.1.1.2',

  mtxrNeighborTable: '1.3.6.1.4.1.14988.1.1.11.1',
  mtxrNeighborIpAddress: '1.3.6.1.4.1.14988.1.1.11.1.1.2',
  mtxrNeighborMacAddress: '1.3.6.1.4.1.14988.1.1.11.1.1.3',
  mtxrNeighborIdentity: '1.3.6.1.4.1.14988.1.1.11.1.1.4',
  mtxrNeighborPlatform: '1.3.6.1.4.1.14988.1.1.11.1.1.5',
  mtxrNeighborVersion: '1.3.6.1.4.1.14988.1.1.11.1.1.6',
  mtxrNeighborInterfaceID: '1.3.6.1.4.1.14988.1.1.11.1.1.7',

  mtxrPOETable: '1.3.6.1.4.1.14988.1.1.15.1',
  mtxrPOEStatus: '1.3.6.1.4.1.14988.1.1.15.1.1.3',
  mtxrPOECurrent: '1.3.6.1.4.1.14988.1.1.15.1.1.4',
  mtxrPOEVoltage: '1.3.6.1.4.1.14988.1.1.15.1.1.5',
  mtxrPOEPower: '1.3.6.1.4.1.14988.1.1.15.1.1.6',
} as const;

export interface SnmpDeviceConfig {
  host: string;
  port?: number;
  community?: string;
  version?: '1' | '2c';
  timeout?: number;
  deviceType?: 'generic' | 'mikrotik' | 'cisco' | 'ubiquiti';
}

export interface SnmpDeviceInfo {
  host: string;
  sysName: string;
  sysDescr: string;
  sysUptime: number;
  sysLocation?: string | undefined;
  deviceType: string;
  vendor?: string | undefined;
}

export interface SnmpInterface {
  index: number;
  name: string;
  type: number;
  speed: number;
  mtu: number;
  macAddress?: string;
  adminStatus: 'up' | 'down' | 'testing';
  operStatus: 'up' | 'down' | 'testing' | 'unknown' | 'dormant' | 'notPresent' | 'lowerLayerDown';
  inOctets: number;
  outOctets: number;
  inErrors: number;
  outErrors: number;
  inPackets: number;
  outPackets: number;
}

export interface SnmpPortStats {
  port: number;
  name: string;
  linkUp: boolean;
  speed: number;
  rxBytes: number;
  txBytes: number;
  rxPackets: number;
  txPackets: number;
  rxErrors: number;
  txErrors: number;
  utilization: number;
}

export interface MikroTikHealthData {
  temperature?: number | undefined;
  cpuTemperature?: number | undefined;
  cpuLoad?: number | undefined;
  voltage?: number | undefined;
  current?: number | undefined;
  power?: number | undefined;
  fanActive?: boolean | undefined;
}

export interface SnmpNetworkAnalysis {
  timestamp: Date;
  devices: SnmpDeviceInfo[];
  interfaces: Map<string, SnmpInterface[]>;
  portStats: Map<string, SnmpPortStats[]>;
  mikrotikHealth: Map<string, MikroTikHealthData>;
  problems: SnmpDetectedProblem[];
  recommendations: string[];
}

export interface SwitchStatus {
  host: string;
  name: string;
  vendor: string;
  model: string;
  uptime: number;
  portCount: number;
  activePorts: number;
  totalTraffic: {
    rxBytes: number;
    txBytes: number;
    rxBytesPerSec: number;
    txBytesPerSec: number;
  };
  poeStatus?: {
    totalPower: number;
    usedPower: number;
    availablePower: number;
  } | undefined;
  temperature?: number | undefined;
  cpuLoad?: number | undefined;
}

export interface SwitchPortDetail {
  port: number;
  name: string;
  description: string;
  adminStatus: 'up' | 'down';
  operStatus: 'up' | 'down' | 'unknown';
  speed: number;
  duplex: 'full' | 'half' | 'unknown';
  vlan?: number;
  poeEnabled?: boolean;
  poePower?: number;
  connectedDevice?: {
    mac: string;
    vendor?: string;
    hostname?: string;
  };
  traffic: {
    rxBytes: number;
    txBytes: number;
    rxPackets: number;
    txPackets: number;
    rxErrors: number;
    txErrors: number;
    rxBytesPerSec: number;
    txBytesPerSec: number;
    utilizationPercent: number;
  };
}

export interface SnmpDetectedProblem {
  deviceHost: string;
  severity: 'info' | 'warning' | 'critical';
  type: string;
  message: string;
  affectedInterface?: string;
}

export class SnmpClient {
  private devices: Map<string, SnmpDeviceConfig> = new Map();
  private cachedData: Map<string, { data: unknown; timestamp: Date }> = new Map();
  private readonly cacheTimeout = 30000;

  constructor(devices?: SnmpDeviceConfig[]) {
    if (devices) {
      for (const device of devices) {
        this.addDevice(device);
      }
    }
  }

  addDevice(config: SnmpDeviceConfig): void {
    const key = `${config.host}:${config.port ?? 161}`;
    this.devices.set(key, {
      port: 161,
      community: 'public',
      version: '2c',
      timeout: SNMP_TIMEOUT,
      deviceType: 'generic',
      ...config,
    });
    logger.info({ host: config.host }, 'SNMP device added');
  }

  removeDevice(host: string, port: number = 161): void {
    const key = `${host}:${port}`;
    this.devices.delete(key);
    logger.info({ host }, 'SNMP device removed');
  }

  isConfigured(): boolean {
    return this.devices.size > 0;
  }

  private async snmpGet(host: string, port: number, community: string, oid: string): Promise<string | number | null> {
    return new Promise((resolve) => {
      try {
        const dgram = require('dgram');
        const socket = dgram.createSocket('udp4');

        const requestId = Math.floor(Math.random() * 0x7FFFFFFF);
        const message = this.buildSnmpGetRequest(requestId, community, oid);

        const timeout = setTimeout(() => {
          socket.close();
          resolve(null);
        }, SNMP_TIMEOUT);

        socket.on('message', (msg: Buffer) => {
          clearTimeout(timeout);
          try {
            const value = this.parseSnmpResponse(msg);
            resolve(value);
          } catch {
            resolve(null);
          }
          socket.close();
        });

        socket.on('error', () => {
          clearTimeout(timeout);
          socket.close();
          resolve(null);
        });

        socket.send(message, 0, message.length, port, host);
      } catch {
        resolve(null);
      }
    });
  }

  private buildSnmpGetRequest(requestId: number, community: string, oid: string): Buffer {
    const oidParts = oid.split('.').map(n => parseInt(n, 10));

    const oidBytes: number[] = [];
    for (let i = 0; i < oidParts.length; i++) {
      if (i === 0) {
        oidBytes.push(oidParts[0]! * 40 + (oidParts[1] ?? 0));
        i++;
      } else {
        const value = oidParts[i]!;
        if (value < 128) {
          oidBytes.push(value);
        } else {
          const bytes: number[] = [];
          let v = value;
          while (v > 0) {
            bytes.unshift(v & 0x7F);
            v = v >> 7;
          }
          for (let j = 0; j < bytes.length - 1; j++) {
            bytes[j] = bytes[j]! | 0x80;
          }
          oidBytes.push(...bytes);
        }
      }
    }

    const oidEncoded = Buffer.from([0x06, oidBytes.length, ...oidBytes]);
    const nullValue = Buffer.from([0x05, 0x00]);
    const varbind = Buffer.concat([
      Buffer.from([0x30, oidEncoded.length + nullValue.length]),
      oidEncoded,
      nullValue,
    ]);
    const varbindList = Buffer.concat([Buffer.from([0x30, varbind.length]), varbind]);

    const requestIdBuf = Buffer.alloc(6);
    requestIdBuf[0] = 0x02;
    requestIdBuf[1] = 0x04;
    requestIdBuf.writeInt32BE(requestId, 2);

    const errorStatus = Buffer.from([0x02, 0x01, 0x00]);
    const errorIndex = Buffer.from([0x02, 0x01, 0x00]);

    const pduContent = Buffer.concat([requestIdBuf, errorStatus, errorIndex, varbindList]);
    const pdu = Buffer.concat([Buffer.from([0xA0, pduContent.length]), pduContent]);

    const communityBuf = Buffer.from([0x04, community.length, ...Buffer.from(community)]);
    const version = Buffer.from([0x02, 0x01, 0x01]);

    const messageContent = Buffer.concat([version, communityBuf, pdu]);
    const message = Buffer.concat([Buffer.from([0x30, messageContent.length]), messageContent]);

    return message;
  }

  private parseSnmpResponse(msg: Buffer): string | number | null {
    try {
      let offset = 0;

      if (msg[offset] !== 0x30) return null;
      offset += 2;

      if (msg[offset] !== 0x02) return null;
      offset += 2 + msg[offset + 1]!;

      if (msg[offset] !== 0x04) return null;
      const communityLen = msg[offset + 1]!;
      offset += 2 + communityLen;

      if (msg[offset] !== 0xA2) return null;
      offset += 2;

      offset += 6;
      offset += 3;
      offset += 3;

      if (msg[offset] !== 0x30) return null;
      offset += 2;

      if (msg[offset] !== 0x30) return null;
      offset += 2;

      if (msg[offset] !== 0x06) return null;
      const oidLen = msg[offset + 1]!;
      offset += 2 + oidLen;

      const valueType = msg[offset]!;
      const valueLen = msg[offset + 1]!;
      offset += 2;

      switch (valueType) {
        case 0x02:
          if (valueLen === 1) return msg[offset]!;
          if (valueLen === 2) return msg.readInt16BE(offset);
          if (valueLen === 4) return msg.readInt32BE(offset);
          return null;
        case 0x04:
          return msg.slice(offset, offset + valueLen).toString('utf8');
        case 0x41:
        case 0x42:
        case 0x43:
          if (valueLen === 4) return msg.readUInt32BE(offset);
          return null;
        case 0x40:
          return Array.from(msg.slice(offset, offset + valueLen))
            .map(b => b.toString(16).padStart(2, '0'))
            .join(':');
        default:
          return null;
      }
    } catch {
      return null;
    }
  }

  async getDeviceInfo(host: string, port: number = 161): Promise<SnmpDeviceInfo | null> {
    const config = this.devices.get(`${host}:${port}`);
    const community = config?.community ?? 'public';

    const [sysName, sysDescr, sysUptime, sysLocation] = await Promise.all([
      this.snmpGet(host, port, community, STANDARD_OIDS.sysName),
      this.snmpGet(host, port, community, STANDARD_OIDS.sysDescr),
      this.snmpGet(host, port, community, STANDARD_OIDS.sysUpTime),
      this.snmpGet(host, port, community, STANDARD_OIDS.sysLocation),
    ]);

    if (!sysName && !sysDescr) {
      return null;
    }

    const descrStr = String(sysDescr ?? '').toLowerCase();
    let vendor = 'Unknown';
    let deviceType = 'generic';

    if (descrStr.includes('mikrotik') || descrStr.includes('routeros') || descrStr.includes('swos')) {
      vendor = 'MikroTik';
      deviceType = 'mikrotik';
    } else if (descrStr.includes('cisco')) {
      vendor = 'Cisco';
      deviceType = 'cisco';
    } else if (descrStr.includes('ubiquiti') || descrStr.includes('unifi')) {
      vendor = 'Ubiquiti';
      deviceType = 'ubiquiti';
    }

    return {
      host,
      sysName: String(sysName ?? host),
      sysDescr: String(sysDescr ?? ''),
      sysUptime: typeof sysUptime === 'number' ? sysUptime / 100 : 0,
      sysLocation: sysLocation ? String(sysLocation) : undefined,
      deviceType,
      vendor,
    };
  }

  async getMikroTikHealth(host: string, port: number = 161): Promise<MikroTikHealthData | null> {
    const config = this.devices.get(`${host}:${port}`);
    const community = config?.community ?? 'public';

    const [temp, cpuTemp, cpuLoad, voltage, current, power, fan] = await Promise.all([
      this.snmpGet(host, port, community, MIKROTIK_OIDS.mtxrHlTemperature),
      this.snmpGet(host, port, community, MIKROTIK_OIDS.mtxrHlProcessorTemperature),
      this.snmpGet(host, port, community, MIKROTIK_OIDS.mtxrHlCpuLoad),
      this.snmpGet(host, port, community, MIKROTIK_OIDS.mtxrHlVoltage),
      this.snmpGet(host, port, community, MIKROTIK_OIDS.mtxrHlCurrent),
      this.snmpGet(host, port, community, MIKROTIK_OIDS.mtxrHlPower),
      this.snmpGet(host, port, community, MIKROTIK_OIDS.mtxrHlActiveFan),
    ]);

    const hasData = temp !== null || cpuLoad !== null;
    if (!hasData) return null;

    return {
      temperature: typeof temp === 'number' ? temp / 10 : undefined,
      cpuTemperature: typeof cpuTemp === 'number' ? cpuTemp / 10 : undefined,
      cpuLoad: typeof cpuLoad === 'number' ? cpuLoad : undefined,
      voltage: typeof voltage === 'number' ? voltage / 10 : undefined,
      current: typeof current === 'number' ? current : undefined,
      power: typeof power === 'number' ? power / 10 : undefined,
      fanActive: typeof fan === 'number' ? fan > 0 : undefined,
    };
  }

  async analyzeNetwork(): Promise<SnmpNetworkAnalysis> {
    logger.info('Starting SNMP network analysis');

    const devices: SnmpDeviceInfo[] = [];
    const interfaces = new Map<string, SnmpInterface[]>();
    const portStats = new Map<string, SnmpPortStats[]>();
    const mikrotikHealth = new Map<string, MikroTikHealthData>();
    const problems: SnmpDetectedProblem[] = [];

    for (const [key, config] of this.devices) {
      try {
        const info = await withTimeout(
          this.getDeviceInfo(config.host, config.port),
          SNMP_TIMEOUT * 2,
          `SNMP timeout for ${config.host}`
        );

        if (info) {
          devices.push(info);

          if (info.deviceType === 'mikrotik') {
            const health = await this.getMikroTikHealth(config.host, config.port);
            if (health) {
              mikrotikHealth.set(config.host, health);

              if (health.temperature && health.temperature > 70) {
                problems.push({
                  deviceHost: config.host,
                  severity: health.temperature > 80 ? 'critical' : 'warning',
                  type: 'high_temperature',
                  message: `Hohe Temperatur: ${health.temperature}°C`,
                });
              }

              if (health.cpuLoad && health.cpuLoad > 80) {
                problems.push({
                  deviceHost: config.host,
                  severity: health.cpuLoad > 95 ? 'critical' : 'warning',
                  type: 'high_cpu',
                  message: `Hohe CPU-Last: ${health.cpuLoad}%`,
                });
              }
            }
          }
        }
      } catch (err) {
        logger.warn({ err, host: config.host }, 'Failed to query SNMP device');
        problems.push({
          deviceHost: config.host,
          severity: 'warning',
          type: 'unreachable',
          message: 'SNMP-Gerät nicht erreichbar',
        });
      }
    }

    const recommendations = this.generateRecommendations(problems, mikrotikHealth);

    logger.info({ 
      deviceCount: devices.length, 
      problemCount: problems.length 
    }, 'SNMP analysis complete');

    return {
      timestamp: new Date(),
      devices,
      interfaces,
      portStats,
      mikrotikHealth,
      problems,
      recommendations,
    };
  }

  private generateRecommendations(
    problems: SnmpDetectedProblem[],
    health: Map<string, MikroTikHealthData>
  ): string[] {
    const recommendations: string[] = [];

    const tempProblems = problems.filter(p => p.type === 'high_temperature');
    if (tempProblems.length > 0) {
      recommendations.push(
        `${tempProblems.length} Geräte mit hoher Temperatur. Kühlung oder Standort prüfen.`
      );
    }

    const cpuProblems = problems.filter(p => p.type === 'high_cpu');
    if (cpuProblems.length > 0) {
      recommendations.push(
        `${cpuProblems.length} Geräte mit hoher CPU-Last. Traffic oder Konfiguration prüfen.`
      );
    }

    const unreachable = problems.filter(p => p.type === 'unreachable');
    if (unreachable.length > 0) {
      recommendations.push(
        `${unreachable.length} SNMP-Geräte nicht erreichbar. Community-String und Netzwerk prüfen.`
      );
    }

    for (const [host, data] of health) {
      if (data.voltage && (data.voltage < 11 || data.voltage > 57)) {
        recommendations.push(
          `${host}: Ungewöhnliche Spannung (${data.voltage}V). Netzteil prüfen.`
        );
      }
    }

    return recommendations;
  }

  getConfiguredDevices(): SnmpDeviceConfig[] {
    return Array.from(this.devices.values());
  }

  clearCache(): void {
    this.cachedData.clear();
  }

  async getSwitchStatus(host: string, port: number = 161): Promise<SwitchStatus | null> {
    const config = this.devices.get(`${host}:${port}`);
    const community = config?.community ?? 'public';

    const deviceInfo = await this.getDeviceInfo(host, port);
    if (!deviceInfo) return null;

    const ifNumber = await this.snmpGet(host, port, community, STANDARD_OIDS.ifNumber);
    const portCount = typeof ifNumber === 'number' ? ifNumber : 0;

    let activePorts = 0;
    let totalRx = 0;
    let totalTx = 0;

    for (let i = 1; i <= Math.min(portCount, 48); i++) {
      const operStatus = await this.snmpGet(host, port, community, `${STANDARD_OIDS.ifOperStatus}.${i}`);
      if (operStatus === 1) activePorts++;

      const rxBytes = await this.snmpGet(host, port, community, `${STANDARD_OIDS.ifInOctets}.${i}`);
      const txBytes = await this.snmpGet(host, port, community, `${STANDARD_OIDS.ifOutOctets}.${i}`);
      
      if (typeof rxBytes === 'number') totalRx += rxBytes;
      if (typeof txBytes === 'number') totalTx += txBytes;
    }

    let temperature: number | undefined;
    let cpuLoad: number | undefined;
    let poeStatus: SwitchStatus['poeStatus'];

    if (deviceInfo.deviceType === 'mikrotik') {
      const health = await this.getMikroTikHealth(host, port);
      if (health) {
        temperature = health.temperature;
        cpuLoad = health.cpuLoad;
      }

      const poePower = await this.snmpGet(host, port, community, MIKROTIK_OIDS.mtxrPOEPower);
      if (typeof poePower === 'number') {
        poeStatus = {
          totalPower: 150,
          usedPower: poePower / 10,
          availablePower: 150 - (poePower / 10),
        };
      }
    }

    return {
      host,
      name: deviceInfo.sysName,
      vendor: deviceInfo.vendor ?? 'Unknown',
      model: this.extractModel(deviceInfo.sysDescr),
      uptime: deviceInfo.sysUptime,
      portCount,
      activePorts,
      totalTraffic: {
        rxBytes: totalRx,
        txBytes: totalTx,
        rxBytesPerSec: 0,
        txBytesPerSec: 0,
      },
      poeStatus,
      temperature,
      cpuLoad,
    };
  }

  async getSwitchPortDetails(host: string, port: number = 161): Promise<SwitchPortDetail[]> {
    const config = this.devices.get(`${host}:${port}`);
    const community = config?.community ?? 'public';

    const ifNumber = await this.snmpGet(host, port, community, STANDARD_OIDS.ifNumber);
    const portCount = typeof ifNumber === 'number' ? Math.min(ifNumber, 48) : 0;

    const ports: SwitchPortDetail[] = [];

    for (let i = 1; i <= portCount; i++) {
      const [name, adminStatus, operStatus, speed, rxBytes, txBytes, rxPkts, txPkts, rxErr, txErr] = 
        await Promise.all([
          this.snmpGet(host, port, community, `${STANDARD_OIDS.ifDescr}.${i}`),
          this.snmpGet(host, port, community, `${STANDARD_OIDS.ifAdminStatus}.${i}`),
          this.snmpGet(host, port, community, `${STANDARD_OIDS.ifOperStatus}.${i}`),
          this.snmpGet(host, port, community, `${STANDARD_OIDS.ifSpeed}.${i}`),
          this.snmpGet(host, port, community, `${STANDARD_OIDS.ifInOctets}.${i}`),
          this.snmpGet(host, port, community, `${STANDARD_OIDS.ifOutOctets}.${i}`),
          this.snmpGet(host, port, community, `${STANDARD_OIDS.ifInUcastPkts}.${i}`),
          this.snmpGet(host, port, community, `${STANDARD_OIDS.ifOutUcastPkts}.${i}`),
          this.snmpGet(host, port, community, `${STANDARD_OIDS.ifInErrors}.${i}`),
          this.snmpGet(host, port, community, `${STANDARD_OIDS.ifOutErrors}.${i}`),
        ]);

      const speedNum = typeof speed === 'number' ? speed : 0;
      const rxBytesNum = typeof rxBytes === 'number' ? rxBytes : 0;
      const txBytesNum = typeof txBytes === 'number' ? txBytes : 0;

      ports.push({
        port: i,
        name: String(name ?? `Port ${i}`),
        description: String(name ?? ''),
        adminStatus: adminStatus === 1 ? 'up' : 'down',
        operStatus: operStatus === 1 ? 'up' : operStatus === 2 ? 'down' : 'unknown',
        speed: speedNum,
        duplex: speedNum >= 1000000000 ? 'full' : 'unknown',
        traffic: {
          rxBytes: rxBytesNum,
          txBytes: txBytesNum,
          rxPackets: typeof rxPkts === 'number' ? rxPkts : 0,
          txPackets: typeof txPkts === 'number' ? txPkts : 0,
          rxErrors: typeof rxErr === 'number' ? rxErr : 0,
          txErrors: typeof txErr === 'number' ? txErr : 0,
          rxBytesPerSec: 0,
          txBytesPerSec: 0,
          utilizationPercent: speedNum > 0 ? Math.min(100, ((rxBytesNum + txBytesNum) * 8 / speedNum) * 100) : 0,
        },
      });
    }

    return ports;
  }

  private extractModel(sysDescr: string): string {
    const match = sysDescr.match(/(?:RouterOS|SwOS|CRS|CSS|RB|CCR|hAP|hEX)\s*(\S+)/i);
    if (match) return match[0];
    
    const parts = sysDescr.split(/[,\s]+/);
    return parts[0] ?? 'Unknown';
  }
}
