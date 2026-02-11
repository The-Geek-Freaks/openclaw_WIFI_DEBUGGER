import { z } from 'zod';

export const SpectrumBandSchema = z.enum(['2.4GHz', '5GHz', '6GHz', 'zigbee', 'bluetooth']);
export type SpectrumBand = z.infer<typeof SpectrumBandSchema>;

export const FrequencyOccupantSchema = z.object({
  id: z.string(),
  type: z.enum(['wifi_own', 'wifi_neighbor', 'zigbee', 'bluetooth', 'unknown']),
  band: SpectrumBandSchema,
  channel: z.number(),
  channelWidth: z.number().optional(),
  signalStrength: z.number(),
  ssidOrName: z.string().optional(),
  isControllable: z.boolean(),
  lastSeen: z.date(),
});
export type FrequencyOccupant = z.infer<typeof FrequencyOccupantSchema>;

export const SpectrumMapSchema = z.object({
  band: SpectrumBandSchema,
  occupants: z.array(FrequencyOccupantSchema),
  noiseFloor: z.number(),
  congestionScore: z.number().min(0).max(100),
  recommendedChannels: z.array(z.number()),
});
export type SpectrumMap = z.infer<typeof SpectrumMapSchema>;

export const DataSourceStatusSchema = z.object({
  source: z.enum(['router_ssh', 'home_assistant', 'snmp', 'neighbor_scan', 'zigbee', 'bluetooth']),
  available: z.boolean(),
  lastSuccess: z.date().optional(),
  lastError: z.string().optional(),
  dataFreshness: z.enum(['fresh', 'stale', 'unavailable']),
});
export type DataSourceStatus = z.infer<typeof DataSourceStatusSchema>;

export const NetworkContextSchema = z.object({
  timestamp: z.date(),
  dataSources: z.array(DataSourceStatusSchema),
  spectrumMaps: z.array(SpectrumMapSchema),
  
  wifiState: z.object({
    ownNetworks: z.array(z.object({
      ssid: z.string(),
      band: z.string(),
      channel: z.number(),
      channelWidth: z.number(),
      clientCount: z.number(),
      avgSignalStrength: z.number(),
    })),
    neighborNetworks: z.array(z.object({
      ssid: z.string(),
      bssid: z.string(),
      channel: z.number(),
      signalStrength: z.number(),
      isHidden: z.boolean(),
    })),
  }),
  
  zigbeeState: z.object({
    channel: z.number(),
    deviceCount: z.number(),
    routerCount: z.number(),
    avgLqi: z.number(),
    hasConflictWithWifi: z.boolean(),
  }).optional(),
  
  bluetoothState: z.object({
    deviceCount: z.number(),
    activeConnections: z.number(),
    interferenceLevel: z.enum(['none', 'low', 'medium', 'high']),
  }).optional(),
  
  topologyState: z.object({
    meshNodeCount: z.number(),
    totalDevices: z.number(),
    wiredBackhaul: z.boolean(),
    bottleneckNodes: z.array(z.string()),
  }).optional(),
  
  environmentScore: z.object({
    overall: z.number().min(0).max(100),
    wifiHealth: z.number().min(0).max(100),
    spectrumCongestion: z.number().min(0).max(100),
    crossProtocolHarmony: z.number().min(0).max(100),
    stabilityIndex: z.number().min(0).max(100),
  }),
});
export type NetworkContext = z.infer<typeof NetworkContextSchema>;

export const OptimizationTargetSchema = z.enum([
  'minimize_interference',
  'maximize_throughput', 
  'balance_coverage',
  'protect_zigbee',
  'reduce_neighbor_overlap',
  'improve_roaming',
]);
export type OptimizationTarget = z.infer<typeof OptimizationTargetSchema>;

export const IntelligentRecommendationSchema = z.object({
  id: z.string(),
  priority: z.number().min(1).max(10),
  target: OptimizationTargetSchema,
  
  action: z.object({
    type: z.enum(['change_channel', 'adjust_power', 'enable_feature', 'disable_feature', 'relocate_node']),
    parameters: z.record(z.unknown()),
  }),
  
  reasoning: z.array(z.string()),
  expectedImpact: z.object({
    wifiImprovement: z.number(),
    zigbeeImpact: z.number(),
    neighborImpact: z.number(),
  }),
  
  confidence: z.number().min(0).max(1),
  requiresRestart: z.boolean(),
  estimatedDowntime: z.number(),
});
export type IntelligentRecommendation = z.infer<typeof IntelligentRecommendationSchema>;

export const ScanPhaseSchema = z.enum([
  'idle',
  'collecting_router_data',
  'collecting_zigbee_data',
  'collecting_snmp_data',
  'scanning_neighbors',
  'analyzing',
  'generating_recommendations',
  'complete',
]);
export type ScanPhase = z.infer<typeof ScanPhaseSchema>;

export const FullScanResultSchema = z.object({
  startTime: z.date(),
  endTime: z.date(),
  duration: z.number(),
  context: NetworkContextSchema,
  recommendations: z.array(IntelligentRecommendationSchema),
  warnings: z.array(z.string()),
  errors: z.array(z.string()),
});
export type FullScanResult = z.infer<typeof FullScanResultSchema>;
