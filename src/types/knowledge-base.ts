import { z } from 'zod';
import { NetworkDeviceSchema, MeshNodeSchema, WifiSettingsSchema, ConnectionEventSchema } from './network.js';
import { ZigbeeDeviceSchema } from './zigbee.js';

export const DeviceProfileSchema = z.object({
  macAddress: z.string(),
  firstSeen: z.string(),
  lastSeen: z.string(),
  hostnames: z.array(z.string()),
  ipAddresses: z.array(z.string()),
  vendor: z.string().optional(),
  deviceType: z.enum(['router', 'switch', 'ap', 'computer', 'phone', 'tablet', 'iot', 'smart_home', 'media', 'gaming', 'unknown']).optional(),
  customName: z.string().optional(),
  notes: z.string().optional(),
  preferredNode: z.string().optional(),
  avgSignalStrength: z.number().optional(),
  totalConnectionTime: z.number(),
  disconnectCount: z.number(),
  isKnown: z.boolean(),
  tags: z.array(z.string()),
});
export type DeviceProfile = z.infer<typeof DeviceProfileSchema>;

export const SnmpDeviceProfileSchema = z.object({
  host: z.string(),
  port: z.number(),
  community: z.string(),
  deviceType: z.enum(['switch', 'router', 'firewall', 'ap', 'unknown']),
  vendor: z.string().optional(),
  model: z.string().optional(),
  location: z.string().optional(),
  firstDiscovered: z.string(),
  lastSeen: z.string(),
  portCount: z.number().optional(),
  vlans: z.array(z.string()).optional(),
  notes: z.string().optional(),
});
export type SnmpDeviceProfile = z.infer<typeof SnmpDeviceProfileSchema>;

export const NetworkSnapshotSchema = z.object({
  timestamp: z.string(),
  meshNodes: z.array(MeshNodeSchema.extend({
    lastSeen: z.string().optional(),
    firstSeen: z.string().optional(),
  }).passthrough()),
  wifiSettings: z.array(WifiSettingsSchema.passthrough()),
  deviceCount: z.number(),
  onlineDevices: z.number(),
  healthScore: z.number().optional(),
  zigbeeChannel: z.number().optional(),
  zigbeeDeviceCount: z.number().optional(),
});
export type NetworkSnapshot = z.infer<typeof NetworkSnapshotSchema>;

export const NetworkKnowledgeSchema = z.object({
  version: z.literal(1),
  createdAt: z.string(),
  updatedAt: z.string(),
  networkId: z.string(),
  networkName: z.string().optional(),
  devices: z.record(z.string(), DeviceProfileSchema),
  meshNodes: z.record(z.string(), z.object({
    macAddress: z.string(),
    name: z.string(),
    ipAddress: z.string(),
    isMainRouter: z.boolean(),
    firstSeen: z.string(),
    lastSeen: z.string(),
    location: z.object({
      x: z.number(),
      y: z.number(),
      z: z.number(),
      room: z.string().optional(),
    }).optional(),
  })),
  snmpDevices: z.record(z.string(), SnmpDeviceProfileSchema),
  zigbeeDevices: z.record(z.string(), z.object({
    ieeeAddress: z.string(),
    friendlyName: z.string(),
    type: z.string(),
    manufacturer: z.string().optional(),
    model: z.string().optional(),
    firstSeen: z.string(),
    lastSeen: z.string(),
  })),
  snapshots: z.array(NetworkSnapshotSchema),
  connectionEvents: z.array(z.object({
    timestamp: z.string(),
    eventType: z.string(),
    deviceMac: z.string(),
    nodeMac: z.string(),
    details: z.record(z.unknown()).optional(),
  })),
  optimizationHistory: z.array(z.object({
    timestamp: z.string(),
    action: z.string(),
    before: z.record(z.unknown()),
    after: z.record(z.unknown()),
    result: z.enum(['success', 'failed', 'reverted']),
  })),
  settings: z.object({
    snapshotRetentionDays: z.number(),
    eventRetentionDays: z.number(),
    autoSnapshot: z.boolean(),
    snapshotIntervalHours: z.number(),
  }),
});
export type NetworkKnowledge = z.infer<typeof NetworkKnowledgeSchema>;

export const DEFAULT_KNOWLEDGE_SETTINGS = {
  snapshotRetentionDays: 30,
  eventRetentionDays: 7,
  autoSnapshot: true,
  snapshotIntervalHours: 6,
} as const;
