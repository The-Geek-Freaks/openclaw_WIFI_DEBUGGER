import type { MeshNode, NetworkDevice, WifiSettings } from '../types/network.js';
import type { ZigbeeNetworkState, ZigbeeDevice } from '../types/zigbee.js';
import type { ConnectionEvent } from '../types/network.js';
import type { OptimizationSuggestion } from '../types/analysis.js';
import type { NodePlacement } from '../types/building.js';
import type { HouseConfig } from '../core/real-triangulation.js';

export interface SerializedDevice {
  macAddress: string;
  ipAddress?: string | undefined;
  hostname?: string | undefined;
  vendor?: string | undefined;
  connectionType: string;
  connectedToNode: string;
  signalStrength?: number | undefined;
  status: string;
  lastSeen: string;
  firstSeen: string;
  disconnectCount: number;
  avgConnectionDuration: number;
}

export interface SerializedMeshNode {
  id: string;
  name: string;
  macAddress: string;
  ipAddress: string;
  isMainRouter: boolean;
  firmwareVersion: string;
  uptime: number;
  cpuUsage: number;
  memoryUsage: number;
  connectedClients: number;
  backhaulType: string;
}

export interface SerializedConnectionEvent {
  deviceMac: string;
  nodeMac: string;
  eventType: string;
  timestamp: string;
  details?: Record<string, unknown> | undefined;
}

export interface SerializedZigbeeState {
  channel: number;
  panId: number;
  extendedPanId: string;
  devices: ZigbeeDevice[];
  links: Array<{
    source: string;
    target: string;
    lqi: number;
    depth: number;
  }>;
  lastUpdated: string;
}

export interface SerializedSignalMeasurement {
  nodeMac: string;
  rssi: number;
  timestamp: string;
}

export interface PersistedState {
  version: 2;
  updatedAt: string;
  networkId: string;

  lastScan: {
    timestamp: string;
    nodes: SerializedMeshNode[];
    devices: SerializedDevice[];
    wifiSettings: WifiSettings[];
  } | null;

  lastZigbeeScan: {
    timestamp: string;
    state: SerializedZigbeeState;
  } | null;

  pendingOptimizations: Array<{
    id: string;
    suggestion: OptimizationSuggestion;
  }>;

  triangulation: {
    nodePositions: NodePlacement[];
    houseConfig: HouseConfig | null;
    signalMeasurements: Record<string, Array<{
      nodeMac: string;
      rssi: number;
      timestamp: string;
    }>>;
  };

  geoLocation: unknown | null;

  devices: Record<string, {
    macAddress: string;
    vendor?: string;
    hostname?: string;
    knownName?: string;
    deviceType?: string;
    firstSeen: string;
    lastSeen: string;
    connectionHistory: Array<{
      type: string;
      timestamp: string;
    }>;
  }>;

  connectionEvents: SerializedConnectionEvent[];

  signalHistory: Record<string, SerializedSignalMeasurement[]>;

  settings: {
    snapshotRetentionDays: number;
    eventRetentionDays: number;
    maxSnapshots: number;
    scanStalenessMinutes: number;
  };
}

export function serializeDevice(d: NetworkDevice): SerializedDevice {
  return {
    macAddress: d.macAddress,
    ipAddress: d.ipAddress,
    hostname: d.hostname,
    vendor: d.vendor,
    connectionType: d.connectionType,
    connectedToNode: d.connectedToNode,
    signalStrength: d.signalStrength,
    status: d.status,
    lastSeen: d.lastSeen.toISOString(),
    firstSeen: d.firstSeen.toISOString(),
    disconnectCount: d.disconnectCount,
    avgConnectionDuration: d.avgConnectionDuration,
  };
}

export function deserializeDevice(d: SerializedDevice): NetworkDevice {
  return {
    macAddress: d.macAddress,
    ipAddress: d.ipAddress,
    hostname: d.hostname,
    vendor: d.vendor,
    connectionType: d.connectionType as NetworkDevice['connectionType'],
    connectedToNode: d.connectedToNode,
    signalStrength: d.signalStrength,
    status: d.status as NetworkDevice['status'],
    lastSeen: new Date(d.lastSeen),
    firstSeen: new Date(d.firstSeen),
    disconnectCount: d.disconnectCount,
    avgConnectionDuration: d.avgConnectionDuration,
  };
}

export function serializeMeshNode(n: MeshNode): SerializedMeshNode {
  return {
    id: n.id,
    name: n.name,
    macAddress: n.macAddress,
    ipAddress: n.ipAddress,
    isMainRouter: n.isMainRouter,
    firmwareVersion: n.firmwareVersion,
    uptime: n.uptime,
    cpuUsage: n.cpuUsage,
    memoryUsage: n.memoryUsage,
    connectedClients: n.connectedClients,
    backhaulType: n.backhaulType,
  };
}

export function deserializeMeshNode(n: SerializedMeshNode): MeshNode {
  return {
    id: n.id,
    name: n.name,
    macAddress: n.macAddress,
    ipAddress: n.ipAddress,
    isMainRouter: n.isMainRouter,
    firmwareVersion: n.firmwareVersion,
    uptime: n.uptime,
    cpuUsage: n.cpuUsage,
    memoryUsage: n.memoryUsage,
    connectedClients: n.connectedClients,
    backhaulType: n.backhaulType as MeshNode['backhaulType'],
  };
}

export function serializeConnectionEvent(e: ConnectionEvent): SerializedConnectionEvent {
  return {
    deviceMac: e.deviceMac,
    nodeMac: e.nodeMac,
    eventType: e.eventType,
    timestamp: e.timestamp.toISOString(),
    details: e.details,
  };
}

export function deserializeConnectionEvent(e: SerializedConnectionEvent): ConnectionEvent {
  return {
    deviceMac: e.deviceMac,
    nodeMac: e.nodeMac,
    eventType: e.eventType as ConnectionEvent['eventType'],
    timestamp: new Date(e.timestamp),
    details: e.details,
  };
}

export function serializeZigbeeState(s: ZigbeeNetworkState): SerializedZigbeeState {
  return {
    channel: s.channel,
    panId: s.panId,
    extendedPanId: s.extendedPanId,
    devices: s.devices.map(d => ({
      ...d,
      lastSeen: d.lastSeen ? d.lastSeen.toISOString() : undefined,
    })) as ZigbeeDevice[],
    links: s.links,
    lastUpdated: s.lastUpdated.toISOString(),
  };
}

export function deserializeZigbeeState(s: SerializedZigbeeState): ZigbeeNetworkState {
  return {
    channel: s.channel,
    panId: s.panId,
    extendedPanId: s.extendedPanId,
    devices: s.devices.map(d => ({
      ...d,
      lastSeen: d.lastSeen ? new Date(d.lastSeen as unknown as string) : undefined,
    })),
    links: s.links,
    lastUpdated: new Date(s.lastUpdated),
  };
}

export function createEmptyState(): PersistedState {
  return {
    version: 2,
    updatedAt: new Date().toISOString(),
    networkId: '',
    lastScan: null,
    lastZigbeeScan: null,
    pendingOptimizations: [],
    triangulation: {
      nodePositions: [],
      houseConfig: null,
      signalMeasurements: {},
    },
    geoLocation: null,
    devices: {},
    connectionEvents: [],
    signalHistory: {},
    settings: {
      snapshotRetentionDays: 30,
      eventRetentionDays: 7,
      maxSnapshots: 500,
      scanStalenessMinutes: 60,
    },
  };
}
