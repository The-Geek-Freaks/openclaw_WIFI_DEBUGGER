import { z } from 'zod';

export const ZigbeeDeviceTypeSchema = z.enum([
  'coordinator',
  'router',
  'end_device',
]);
export type ZigbeeDeviceType = z.infer<typeof ZigbeeDeviceTypeSchema>;

export const ZigbeeDeviceSchema = z.object({
  ieeeAddress: z.string(),
  networkAddress: z.number(),
  friendlyName: z.string().optional(),
  type: ZigbeeDeviceTypeSchema,
  manufacturer: z.string().optional(),
  model: z.string().optional(),
  powerSource: z.enum(['battery', 'mains', 'unknown']),
  lqi: z.number(),
  lastSeen: z.date().optional(),
  available: z.boolean(),
});
export type ZigbeeDevice = z.infer<typeof ZigbeeDeviceSchema>;

export const ZigbeeLinkSchema = z.object({
  source: z.string(),
  target: z.string(),
  lqi: z.number(),
  depth: z.number(),
});
export type ZigbeeLink = z.infer<typeof ZigbeeLinkSchema>;

export const ZigbeeNetworkStateSchema = z.object({
  channel: z.number(),
  panId: z.number(),
  extendedPanId: z.string(),
  devices: z.array(ZigbeeDeviceSchema),
  links: z.array(ZigbeeLinkSchema),
  lastUpdated: z.date(),
});
export type ZigbeeNetworkState = z.infer<typeof ZigbeeNetworkStateSchema>;

export const ZigbeeChannelScanSchema = z.object({
  channel: z.number(),
  energy: z.number(),
  wifiOverlap: z.array(z.object({
    wifiChannel: z.number(),
    band: z.string(),
    overlapPercentage: z.number(),
  })),
});
export type ZigbeeChannelScan = z.infer<typeof ZigbeeChannelScanSchema>;

export const FrequencyConflictSchema = z.object({
  zigbeeChannel: z.number(),
  wifiChannel: z.number(),
  wifiBand: z.string(),
  conflictSeverity: z.enum(['none', 'low', 'medium', 'high', 'critical']),
  recommendation: z.string(),
});
export type FrequencyConflict = z.infer<typeof FrequencyConflictSchema>;
