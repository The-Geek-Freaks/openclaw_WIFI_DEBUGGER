import { z } from 'zod';

export const SeverityLevelSchema = z.enum(['info', 'warning', 'error', 'critical']);
export type SeverityLevel = z.infer<typeof SeverityLevelSchema>;

export const ProblemCategorySchema = z.enum([
  'signal_weakness',
  'interference',
  'congestion',
  'roaming_issue',
  'protocol_conflict',
  'configuration_error',
  'hardware_issue',
  'capacity_exceeded',
  'frequency_overlap',
]);
export type ProblemCategory = z.infer<typeof ProblemCategorySchema>;

export const NetworkProblemSchema = z.object({
  id: z.string(),
  category: ProblemCategorySchema,
  severity: SeverityLevelSchema,
  affectedDevices: z.array(z.string()),
  affectedNodes: z.array(z.string()),
  description: z.string(),
  rootCause: z.string(),
  recommendation: z.string(),
  autoFixAvailable: z.boolean(),
  detectedAt: z.date(),
  resolvedAt: z.date().optional(),
});
export type NetworkProblem = z.infer<typeof NetworkProblemSchema>;

export const OptimizationSuggestionSchema = z.object({
  id: z.string(),
  priority: z.number().min(1).max(10),
  category: z.enum(['channel', 'power', 'roaming', 'security', 'zigbee', 'bluetooth']),
  currentValue: z.unknown(),
  suggestedValue: z.unknown(),
  expectedImprovement: z.string(),
  riskLevel: z.enum(['low', 'medium', 'high']),
  affectedDevices: z.array(z.string()),
  description: z.string(),
});
export type OptimizationSuggestion = z.infer<typeof OptimizationSuggestionSchema>;

export const DeviceLocationSchema = z.object({
  macAddress: z.string(),
  estimatedPosition: z.object({
    x: z.number(),
    y: z.number(),
    z: z.number(),
    confidence: z.number().min(0).max(1),
  }),
  signalVectors: z.array(z.object({
    nodeMac: z.string(),
    rssi: z.number(),
    distance: z.number(),
  })),
  room: z.string().optional(),
  floor: z.number().optional(),
});
export type DeviceLocation = z.infer<typeof DeviceLocationSchema>;

export const SpatialMapSchema = z.object({
  timestamp: z.date(),
  nodes: z.array(z.object({
    id: z.string(),
    position: z.object({ x: z.number(), y: z.number(), z: z.number() }),
    coverageRadius: z.number(),
  })),
  devices: z.array(DeviceLocationSchema),
  problemZones: z.array(z.object({
    center: z.object({ x: z.number(), y: z.number(), z: z.number() }),
    radius: z.number(),
    issue: z.string(),
  })),
});
export type SpatialMap = z.infer<typeof SpatialMapSchema>;

export const ConnectionStabilityReportSchema = z.object({
  deviceMac: z.string(),
  period: z.object({
    start: z.date(),
    end: z.date(),
  }),
  totalConnectionTime: z.number(),
  totalDisconnections: z.number(),
  avgConnectionDuration: z.number(),
  longestConnection: z.number(),
  shortestConnection: z.number(),
  disconnectionReasons: z.array(z.object({
    reason: z.string(),
    count: z.number(),
  })),
  stabilityScore: z.number().min(0).max(100),
});
export type ConnectionStabilityReport = z.infer<typeof ConnectionStabilityReportSchema>;

export const NetworkHealthScoreSchema = z.object({
  timestamp: z.date(),
  overall: z.number().min(0).max(100),
  categories: z.object({
    signalQuality: z.number().min(0).max(100),
    channelOptimization: z.number().min(0).max(100),
    deviceStability: z.number().min(0).max(100),
    meshBackhaul: z.number().min(0).max(100),
    zigbeeHealth: z.number().min(0).max(100),
    interferenceLevel: z.number().min(0).max(100),
  }),
  trend: z.enum(['improving', 'stable', 'degrading']),
});
export type NetworkHealthScore = z.infer<typeof NetworkHealthScoreSchema>;
