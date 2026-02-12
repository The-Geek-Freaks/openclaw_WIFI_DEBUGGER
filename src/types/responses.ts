import { z } from 'zod';
import type { MeshNode, NetworkDevice, WifiSettings, ConnectionEvent } from './network.js';
import type { NetworkHealthScore, OptimizationSuggestion, NetworkProblem } from './analysis.js';
import type { ZigbeeDevice } from './zigbee.js';
import type { FloorHeatmap } from './building.js';
import type { BenchmarkSuiteResult } from './benchmark.js';

// Base response schema with typed data
export const BaseResponseSchema = z.object({
  success: z.boolean(),
  action: z.string(),
  error: z.string().optional(),
  suggestions: z.array(z.string()).optional(),
  timestamp: z.string(),
  confidence: z.number().min(0).max(1).optional(),
  dataQuality: z.enum(['complete', 'partial', 'estimated']).optional(),
});

export type BaseResponse = z.infer<typeof BaseResponseSchema>;

// Typed response interfaces for each action category

export interface ScanNetworkResponse extends BaseResponse {
  action: 'scan_network';
  data: {
    nodes: MeshNode[];
    devices: NetworkDevice[];
    wifiSettings: WifiSettings;
    lastUpdated: string;
    summary: {
      nodeCount: number;
      deviceCount: number;
      wirelessDevices: number;
      wiredDevices: number;
    };
  };
}

export interface NetworkHealthResponse extends BaseResponse {
  action: 'get_network_health';
  data: NetworkHealthScore;
}

export interface DeviceListResponse extends BaseResponse {
  action: 'get_device_list';
  data: {
    devices: NetworkDevice[];
    total: number;
    wireless: number;
    wired: number;
    problematic: number;
  };
}

export interface DeviceDetailsResponse extends BaseResponse {
  action: 'get_device_details';
  data: {
    device: NetworkDevice;
    signalHistory: Array<{ timestamp: string; rssi: number }>;
    connectionEvents: ConnectionEvent[];
    connectedNode: MeshNode | null;
  };
}

export interface OptimizationSuggestionsResponse extends BaseResponse {
  action: 'get_optimization_suggestions';
  data: {
    operationMode: 'router' | 'ap';
    count: number;
    apModeOptimizations: number;
    suggestions: Array<{
      id: string;
      priority: number;
      category: string;
      title: string;
      description: string;
      impact: string;
      risk: 'low' | 'medium' | 'high';
      requiresReboot: boolean;
    }>;
  };
}

export interface ApplyOptimizationResponse extends BaseResponse {
  action: 'apply_optimization';
  data: {
    applied: boolean;
    suggestionId: string;
    result: string;
    requiresReboot: boolean;
  };
}

export interface ProblemsResponse extends BaseResponse {
  action: 'get_problems';
  data: {
    problems: NetworkProblem[];
    total: number;
    bySeverity: {
      critical: number;
      error: number;
      warning: number;
      info: number;
    };
  };
}

export interface ChannelScanResponse extends BaseResponse {
  action: 'get_channel_scan';
  data: {
    band: '2.4GHz' | '5GHz' | 'both';
    channels: Array<{
      channel: number;
      frequency: number;
      congestion: number;
      interferingNetworks: number;
      recommendation: 'avoid' | 'acceptable' | 'good' | 'excellent';
    }>;
    currentChannel: { '2.4GHz': number; '5GHz': number };
    recommendedChannel: { '2.4GHz': number; '5GHz': number };
  };
}

export interface ZigbeeResponse extends BaseResponse {
  action: 'scan_zigbee' | 'get_zigbee_devices';
  data: {
    channel: number;
    panId: string;
    devices: ZigbeeDevice[];
    deviceCount: number;
    averageLqi: number;
  };
}

export interface FrequencyConflictsResponse extends BaseResponse {
  action: 'get_frequency_conflicts';
  data: {
    hasConflicts: boolean;
    severity: 'none' | 'minor' | 'moderate' | 'severe';
    conflicts: Array<{
      wifiChannel: number;
      zigbeeChannel: number;
      overlapPercentage: number;
      recommendation: string;
    }>;
  };
}

export interface HeatmapResponse extends BaseResponse {
  action: 'get_heatmap';
  data: FloorHeatmap & {
    telemetry: {
      devicesWithSignal: number;
      totalDevices: number;
      telemetryQuality: number;
      message: string;
    };
  };
}

export interface BenchmarkResponse extends BaseResponse {
  action: 'run_benchmark';
  data: BenchmarkSuiteResult;
}

export interface RouterTweaksResponse extends BaseResponse {
  action: 'check_router_tweaks';
  data: {
    score: number;
    maxScore: number;
    percentage: number;
    tweaks: Array<{
      id: string;
      name: string;
      category: string;
      currentValue: string;
      recommendedValue: string;
      isOptimal: boolean;
      description: string;
      risk: 'low' | 'medium' | 'high';
    }>;
    suboptimalCount: number;
  };
}

export interface TriangulationResponse extends BaseResponse {
  action: 'triangulate_devices';
  data: {
    devices: Array<{
      mac: string;
      hostname: string;
      position: { x: number; y: number; z: number };
      floor: number;
      confidence: number;
      method: 'trilateration' | 'bilateration' | 'single_node' | 'estimated';
    }>;
    nodesUsed: number;
    averageConfidence: number;
  };
}

export interface AutoMapResponse extends BaseResponse {
  action: 'get_auto_map';
  data: {
    floorNumber: number;
    floorType: string;
    ascii: string;
    devices: Array<{
      mac: string;
      hostname: string;
      x: number;
      y: number;
      symbol: string;
    }>;
    nodes: Array<{
      id: string;
      x: number;
      y: number;
      symbol: string;
    }>;
  };
}

export interface LogInfoResponse extends BaseResponse {
  action: 'get_log_info';
  data: {
    logFile: string;
    logDir: string;
    fileLoggingActive: boolean;
    pid: number;
    nodeVersion: string;
    platform: string;
    uptime: number;
  };
}

export interface KnowledgeStatsResponse extends BaseResponse {
  action: 'get_knowledge_stats';
  data: {
    knownDevices: number;
    networkSnapshots: number;
    connectionEvents: number;
    oldestSnapshot: string | null;
    newestSnapshot: string | null;
  };
}

// Union type of all typed responses
export type TypedSkillResponse =
  | ScanNetworkResponse
  | NetworkHealthResponse
  | DeviceListResponse
  | DeviceDetailsResponse
  | OptimizationSuggestionsResponse
  | ApplyOptimizationResponse
  | ProblemsResponse
  | ChannelScanResponse
  | ZigbeeResponse
  | FrequencyConflictsResponse
  | HeatmapResponse
  | BenchmarkResponse
  | RouterTweaksResponse
  | TriangulationResponse
  | AutoMapResponse
  | LogInfoResponse
  | KnowledgeStatsResponse
  | BaseResponse; // Fallback for untyped responses

// Helper to create typed success response
export function createTypedResponse<T extends BaseResponse>(
  action: T['action'],
  data: T extends { data: infer D } ? D : never,
  options: {
    suggestions?: string[];
    confidence?: number;
    dataQuality?: 'complete' | 'partial' | 'estimated';
  } = {}
): T {
  return {
    success: true,
    action,
    data,
    suggestions: options.suggestions,
    confidence: options.confidence,
    dataQuality: options.dataQuality,
    timestamp: new Date().toISOString(),
  } as unknown as T;
}

// Helper to create error response
export function createErrorResponse(action: string, error: string): BaseResponse {
  return {
    success: false,
    action,
    error,
    timestamp: new Date().toISOString(),
  };
}
