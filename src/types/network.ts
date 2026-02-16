import { z } from 'zod';

export const WifiBandSchema = z.enum(['2.4GHz', '5GHz', '5GHz-2', '6GHz']);
export type WifiBand = z.infer<typeof WifiBandSchema>;

export const WifiStandardSchema = z.enum(['802.11a', '802.11b', '802.11g', '802.11n', '802.11ac', '802.11ax']);
export type WifiStandard = z.infer<typeof WifiStandardSchema>;

export const ConnectionTypeSchema = z.enum(['wired', 'wireless_2g', 'wireless_5g', 'wireless_6g', 'mesh_backhaul']);
export type ConnectionType = z.infer<typeof ConnectionTypeSchema>;

export const DeviceStatusSchema = z.enum(['online', 'offline', 'unstable', 'unknown']);
export type DeviceStatus = z.infer<typeof DeviceStatusSchema>;

export const MeshNodeSchema = z.object({
  id: z.string(),
  name: z.string(),
  macAddress: z.string(),
  ipAddress: z.string(),
  isMainRouter: z.boolean(),
  firmwareVersion: z.string(),
  uptime: z.number(),
  cpuUsage: z.number(),
  memoryUsage: z.number(),
  connectedClients: z.number(),
  backhaulType: ConnectionTypeSchema,
  backhaulSignalStrength: z.number().optional(),
  location: z.object({
    x: z.number(),
    y: z.number(),
    z: z.number(),
    room: z.string().optional(),
  }).optional(),
});
export type MeshNode = z.infer<typeof MeshNodeSchema>;

export const NetworkDeviceSchema = z.object({
  macAddress: z.string(),
  ipAddress: z.string().optional(),
  hostname: z.string().optional(),
  vendor: z.string().optional(),
  connectionType: ConnectionTypeSchema,
  connectedToNode: z.string(),
  signalStrength: z.number().optional(),
  txRate: z.number().optional(),
  rxRate: z.number().optional(),
  status: DeviceStatusSchema,
  lastSeen: z.date(),
  firstSeen: z.date(),
  disconnectCount: z.number(),
  avgConnectionDuration: z.number(),
});
export type NetworkDevice = z.infer<typeof NetworkDeviceSchema>;

export const SignalMeasurementSchema = z.object({
  timestamp: z.date(),
  deviceMac: z.string(),
  nodeMac: z.string(),
  rssi: z.number(),
  noiseFloor: z.number().optional(),
  snr: z.number().optional(),
  channel: z.number(),
  channelWidth: z.number(),
  txRate: z.number(),
  rxRate: z.number(),
});
export type SignalMeasurement = z.infer<typeof SignalMeasurementSchema>;

export const WifiSettingsSchema = z.object({
  ssid: z.string(),
  band: WifiBandSchema,
  channel: z.number(),
  channelWidth: z.number(),
  txPower: z.number(),
  standard: WifiStandardSchema,
  security: z.string(),
  bandSteering: z.boolean(),
  smartConnect: z.boolean(),
  roamingAssistant: z.boolean(),
  roamingThreshold: z.number().optional(),
  beamforming: z.boolean(),
  muMimo: z.boolean(),
  ofdma: z.boolean().optional(),
  targetWakeTime: z.boolean().optional(),
});
export type WifiSettings = z.infer<typeof WifiSettingsSchema>;

export const MeshNetworkStateSchema = z.object({
  nodes: z.array(MeshNodeSchema),
  devices: z.array(NetworkDeviceSchema),
  wifiSettings: z.array(WifiSettingsSchema),
  lastUpdated: z.date(),
});
export type MeshNetworkState = z.infer<typeof MeshNetworkStateSchema>;

export const ConnectionEventSchema = z.object({
  timestamp: z.date(),
  eventType: z.enum(['connect', 'disconnect', 'roam', 'signal_drop', 'interference']),
  deviceMac: z.string(),
  nodeMac: z.string(),
  details: z.record(z.unknown()).optional(),
});
export type ConnectionEvent = z.infer<typeof ConnectionEventSchema>;

export const ChannelScanResultSchema = z.object({
  channel: z.number(),
  band: WifiBandSchema,
  utilization: z.number(),
  noiseFloor: z.number(),
  interferingNetworks: z.array(z.object({
    ssid: z.string(),
    bssid: z.string(),
    channel: z.number(),
    signalStrength: z.number(),
    overlap: z.number(),
  })),
});
export type ChannelScanResult = z.infer<typeof ChannelScanResultSchema>;
